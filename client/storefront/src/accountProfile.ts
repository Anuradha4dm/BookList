export type ProfileDraft = {
  name: string
  deliveryAddress: string
  whatsapp: string
  secondPhone: string
  email: string
  password: string
}

export type ProfileResponse = {
  name?: string
  deliveryAddress?: string
  whatsapp?: string
  secondPhone?: string | null
  email?: string
}

export function profileDraftFromGet(body: ProfileResponse, emailFallback: string): ProfileDraft {
  return {
    name: body.name ?? '',
    deliveryAddress: body.deliveryAddress ?? '',
    whatsapp: body.whatsapp ?? '',
    secondPhone: body.secondPhone ?? '',
    email: body.email ?? emailFallback,
    password: '',
  }
}

export function profilePatchBody(draft: ProfileDraft): {
  name: string
  deliveryAddress: string
  whatsapp: string
  secondPhone: string
  password: string
} {
  return {
    name: draft.name,
    deliveryAddress: draft.deliveryAddress,
    whatsapp: draft.whatsapp,
    secondPhone: draft.secondPhone,
    password: draft.password,
  }
}
