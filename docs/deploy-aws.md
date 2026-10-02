# Deploying BookList to AWS (Test stage)

## How it fits together

```
git push / merge to main
   └─► GitHub Actions  (.github/workflows/deploy-test.yml)
         1. npm ci + npm run typecheck
         2. docker build  ──► push to Amazon ECR   (tag = commit SHA)
         3. AWS SSM Run Command on the EC2 server:
              writes docker-compose.yml, Caddyfile, deploy.sh  → /opt/booklist
              deploy.sh <image>  → docker compose pull + up -d
         4. smoke test: GET SITE_URL/

EC2 t3.small · Amazon Linux 2023 · Docker
  ├─ caddy  :80/:443  (automatic HTTPS when SITE_ADDRESS is a domain)
  └─ app    :3000     node server/dist/web/index.js
        └─ /data/booklist/booklist.db   (SQLite, on the instance's EBS disk, snapshotted daily)
```

- GitHub logs in to AWS with the access key of a dedicated IAM user, `booklist-github-deploy`, stored as GitHub environment secrets. That user can only push to the BookList ECR repository and run commands on the test server.
- The server needs **no SSH port**: deploys and shell access both go through AWS Systems Manager (SSM).
- App secrets live **only on the server** in `/opt/booklist/app.env`.

Files in the repo:

| File | Purpose |
|---|---|
| `Dockerfile`, `.dockerignore` | Builds one image with the server plus both SPAs |
| `deploy/docker-compose.yml` | The app and Caddy, as run on the server |
| `deploy/Caddyfile` | Reverse proxy and TLS |
| `deploy/deploy.sh` | Pulls the image and restarts. The workflow runs it on the server |
| `deploy/server-setup.sh` | One-time server bootstrap |
| `.github/workflows/deploy-test.yml` | The pipeline |

---

## Step 0: Before you start

- An AWS account, and a decision on the region. This project uses `ap-southeast-2` (Sydney).
- Optional: a domain or subdomain for the test site, e.g. `test.booklist.example.com`. Without one, the site runs on plain HTTP at the server's IP.
- Use **AWS CloudShell** for the commands below. It's the `>_` icon in the AWS console top bar, is already logged in, and has the AWS CLI. Run all of Steps 1 to 5 in **one** CloudShell session, because they share variables.

Set these first:

```bash
export AWS_REGION=ap-southeast-2
export AWS_DEFAULT_REGION=$AWS_REGION
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR_REPOSITORY=daanlk/booklist   # repository name, without the registry host
echo "Account $ACCOUNT_ID in $AWS_REGION"
```

## Step 1: Create the ECR image repository

Skip `create-repository` if the repository already exists.

```bash
aws ecr create-repository --repository-name $ECR_REPOSITORY \
  --image-scanning-configuration scanOnPush=true

# keep only the newest 30 images
aws ecr put-lifecycle-policy --repository-name $ECR_REPOSITORY --lifecycle-policy-text '{
  "rules":[{"rulePriority":1,"description":"keep 30",
    "selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":30},
    "action":{"type":"expire"}}]}'
```

## Step 2: Create the IAM role for the server

This role lets the server pull images and be reached by SSM.

```bash
aws iam create-role --role-name booklist-ec2 --assume-role-policy-document '{
  "Version":"2012-10-17",
  "Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

aws iam attach-role-policy --role-name booklist-ec2 \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam attach-role-policy --role-name booklist-ec2 \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly

aws iam create-instance-profile --instance-profile-name booklist-ec2
aws iam add-role-to-instance-profile --instance-profile-name booklist-ec2 --role-name booklist-ec2
sleep 15   # let IAM propagate before launching
```

## Step 3: Launch the server

```bash
AMI=$(aws ssm get-parameter \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query Parameter.Value --output text)
VPC=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)

# web traffic only; no port 22
SG=$(aws ec2 create-security-group --group-name booklist-test \
  --description "BookList test web" --vpc-id $VPC --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id $SG --ip-permissions \
  'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0}]' \
  'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}]'

INSTANCE_ID=$(aws ec2 run-instances \
  --image-id $AMI --instance-type t3.small \
  --security-group-ids $SG \
  --iam-instance-profile Name=booklist-ec2 \
  --metadata-options HttpTokens=required \
  --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=20,VolumeType=gp3,Encrypted=true}' \
  --tag-specifications \
    'ResourceType=instance,Tags=[{Key=Name,Value=booklist-test}]' \
    'ResourceType=volume,Tags=[{Key=Name,Value=booklist-test},{Key=Backup,Value=daily}]' \
  --query 'Instances[0].InstanceId' --output text)
echo "INSTANCE_ID=$INSTANCE_ID"

aws ec2 wait instance-running --instance-ids $INSTANCE_ID

# a fixed public IP
ALLOC=$(aws ec2 allocate-address --domain vpc --query AllocationId --output text)
aws ec2 associate-address --instance-id $INSTANCE_ID --allocation-id $ALLOC
PUBLIC_IP=$(aws ec2 describe-addresses --allocation-ids $ALLOC --query 'Addresses[0].PublicIp' --output text)
echo "PUBLIC_IP=$PUBLIC_IP"
```

> Use `t3.small` (x86), not `t4g` (ARM). GitHub's runners build x86 images.

**If you have a domain:** at your DNS provider, create an **A record**, e.g. `test.booklist.example.com → $PUBLIC_IP`. Do it now so it has propagated by the first deploy.

## Step 4: Set up the server (one time)

1. In the AWS console go to **EC2 → Instances → booklist-test → Connect → Session Manager → Connect**. If it isn't available yet, wait 1 to 2 minutes after launch.
2. Become root and create the setup script. Paste the whole contents of `deploy/server-setup.sh` between the two lines below. Skip this if you passed the script as EC2 *User data* at launch, and just check `docker compose version` works.

   ```bash
   sudo -i
   cat > /root/server-setup.sh <<'EOF'
   # ...paste deploy/server-setup.sh here...
   EOF
   bash /root/server-setup.sh
   ```

   It installs Docker and Docker Compose, creates `/data/booklist` (the database folder) and creates `/opt/booklist`.

3. Create the app secrets file. Use your real admin email, and a strong password you'll remember:

   ```bash
   cat > /opt/booklist/app.env <<EOF
   SESSION_SECRET=$(openssl rand -hex 32)
   ADMIN_EMAIL=you@example.com
   ADMIN_PASSWORD=change-me-to-a-strong-password
   EOF
   chmod 600 /opt/booklist/app.env
   ```

4. Tell Caddy which address to serve. Pick **one**:

   ```bash
   # with a domain (HTTPS automatically):
   echo "SITE_ADDRESS=test.booklist.example.com" > /opt/booklist/.env
   # or with no domain yet (plain HTTP on the IP):
   echo "SITE_ADDRESS=:80" > /opt/booklist/.env
   ```

   `deploy.sh` adds an `IMAGE=` line to this file on every deploy. Leave that line alone.

## Step 5: Create the deploy user GitHub logs in with

This uses an IAM user with an access key, because the account's plan blocks IAM identity providers, so OIDC isn't available. Keep the key only in GitHub secrets, and rotate it now and then (see *Rotating the access key* below).

Run this back in **CloudShell**, in the same session:

```bash
aws iam create-user --user-name booklist-github-deploy

# what it may do: push to the booklist ECR repo, run commands on the one test instance
aws iam put-user-policy --user-name booklist-github-deploy --policy-name deploy --policy-document "{
  \"Version\":\"2012-10-17\",
  \"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":\"ecr:GetAuthorizationToken\",\"Resource\":\"*\"},
    {\"Effect\":\"Allow\",\"Action\":[
        \"ecr:BatchCheckLayerAvailability\",\"ecr:InitiateLayerUpload\",\"ecr:UploadLayerPart\",
        \"ecr:CompleteLayerUpload\",\"ecr:PutImage\",\"ecr:BatchGetImage\",\"ecr:GetDownloadUrlForLayer\"],
      \"Resource\":\"arn:aws:ecr:$AWS_REGION:$ACCOUNT_ID:repository/$ECR_REPOSITORY\"},
    {\"Effect\":\"Allow\",\"Action\":\"ssm:SendCommand\",\"Resource\":[
        \"arn:aws:ec2:$AWS_REGION:$ACCOUNT_ID:instance/$INSTANCE_ID\",
        \"arn:aws:ssm:$AWS_REGION::document/AWS-RunShellScript\"]},
    {\"Effect\":\"Allow\",\"Action\":\"ssm:GetCommandInvocation\",\"Resource\":\"*\"}]}"

# prints AccessKeyId and SecretAccessKey ONCE; put both straight into GitHub (Step 6)
aws iam create-access-key --user-name booklist-github-deploy

# print the values you need for GitHub
echo "AWS_REGION=$AWS_REGION"
echo "ECR_REPOSITORY=$ECR_REPOSITORY"
echo "EC2_INSTANCE_ID=$INSTANCE_ID"
echo "SITE_URL=https://test.booklist.example.com   # or http://$PUBLIC_IP"
```

## Step 6: Configure GitHub

1. Go to GitHub → **Settings → Environments → New environment**, and name it `test`.
2. Under **Deployment branches and tags**, choose **Selected branches** and add `main`.
3. Add **Environment secrets**:

   | Name | Value |
   |---|---|
   | `AWS_ACCESS_KEY_ID` | `AccessKeyId` from Step 5 |
   | `AWS_SECRET_ACCESS_KEY` | `SecretAccessKey` from Step 5 |

4. Add **Environment variables**:

   | Name | Example |
   |---|---|
   | `AWS_REGION` | `ap-southeast-2` |
   | `ECR_REPOSITORY` | `daanlk/booklist` |
   | `EC2_INSTANCE_ID` | `i-0abc…` |
   | `SITE_URL` | `https://test.booklist.example.com` or `http://<PUBLIC_IP>` (no trailing slash) |

## Step 7: Deploy

1. Commit the deployment files and get them onto `main`, through a PR or a merge.
2. Every push to `main` now runs **Actions → Deploy to Test**. You can also start it by hand with **Run workflow**, which only appears once the workflow file is on `main`.
3. Watch the run. The **Deploy to the server via SSM** step prints the server's output, ending in `Deployed …`.
4. Open `SITE_URL` for the storefront, and `SITE_URL/admin` for the admin.

### First boot: save the admin recovery code

On first start the server creates the admin account from `ADMIN_EMAIL`/`ADMIN_PASSWORD` and prints a **single-use recovery code**. Copy it somewhere safe. In Session Manager:

```bash
cd /opt/booklist && sudo docker compose logs app | grep -i "recovery code"
```

## Step 8: Turn on daily backups

The SQLite database lives on the instance's EBS volume, which was tagged `Backup=daily` in Step 3. This snapshots it every day and keeps 7 copies:

```bash
aws dlm create-default-role --resource-type snapshot || true
aws dlm create-lifecycle-policy \
  --description "booklist daily" --state ENABLED \
  --execution-role-arn arn:aws:iam::$ACCOUNT_ID:role/AWSDataLifecycleManagerDefaultRole \
  --policy-details '{
    "ResourceTypes":["VOLUME"],
    "TargetTags":[{"Key":"Backup","Value":"daily"}],
    "Schedules":[{"Name":"daily","CreateRule":{"Interval":24,"IntervalUnit":"HOURS","Times":["02:00"]},
                  "RetainRule":{"Count":7},"CopyTags":true}]}'
```

---

## Day-to-day operations

Run these in Session Manager, from `cd /opt/booklist`:

| Task | Command |
|---|---|
| App logs | `sudo docker compose logs -f app` |
| Status | `sudo docker compose ps` |
| Restart | `sudo docker compose restart app` |
| Roll back | `sudo ./deploy.sh <registry>/daanlk/booklist:<older-commit-sha>`. Find tags in ECR, or re-run an older successful workflow |
| Change a secret | edit `app.env`, then `sudo docker compose up -d` |
| Copy the DB out | `sudo sqlite3 /data/booklist/booklist.db ".backup /tmp/booklist-$(date +%F).db"` (run `sudo dnf install -y sqlite` first) |

## Rotating the access key

Every few months, or straight away if the key may have leaked:

1. **IAM → Users → booklist-github-deploy → Security credentials → Create access key**.
2. Update the two GitHub secrets, then re-run the workflow to confirm it still deploys.
3. On the old key, click **Actions → Deactivate**, then **Delete**.

## Troubleshooting

- **SSM step fails with `InvalidInstanceId`:** the SSM agent isn't registered yet. Check **Systems Manager → Fleet Manager**; the instance must show as *Online*. Make sure the `booklist-ec2` role is attached.
- **`The security token included in the request is invalid`:** `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` are wrong or the key was deactivated. They must be *environment* secrets of `test`.
- **`not authorized to perform: ecr:…` or `ssm:SendCommand`:** the `deploy` policy has the wrong repository name, region or instance ID.
- **The app container keeps restarting:** run `docker compose logs app`. `Missing required environment variables` means `app.env` is incomplete.
- **HTTPS doesn't come up:** the DNS A record must point at the Elastic IP, and port 80 must be open. Caddy needs both to get a certificate. See `docker compose logs caddy`.
- **`SQLITE_CANTOPEN` / permission denied:** run `sudo chown -R 1000:1000 /data/booklist`.

## Cost (approx., ap-southeast-2)

t3.small about $19/mo, 20 GB gp3 about $2/mo, plus snapshots, ECR storage and the Elastic IP (about $3.60/mo). That's roughly **$25 to 30/month** for Test.

## Later: Production

Repeat Steps 2 to 6 with `-prod` names: a separate instance, disk, secrets and domain, plus a GitHub environment called `production` with **required reviewers**. Then add a workflow triggered by `workflow_dispatch` that takes an image tag which already passed Test and runs only the SSM deploy step against the prod instance. Production then gets the exact image you tested, with no rebuild. Consider a separate AWS account for production, and switching to OIDC once the account plan allows it.
