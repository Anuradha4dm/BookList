---
title: "Product Brief: Book List"
status: ready
created: 2026-08-14
updated: 2026-08-14
---

# Product Brief: Book List

A commissioned web app, built to one bookshop owner’s requirements: capture private-school book-list orders, and keep them visible until they are delivered or cancelled.

## Executive Summary

This app exists because a specific customer asked for it, and it is built to how he already runs the shop — not as a product for other bookshops.

Private-school parents find their school’s pack, subtract what they already own, and place a list the shop can work. The same cart can hold only pens, only packs, or both. Packs are the main job; they are not required to check out.

The parent does not call the shop. After the order is in, the **admin calls the parent once** to communicate the final price (goods + delivery), then marks the order confirmed in the app. Cash is collected on delivery. The app’s job is to keep that list from being lost: every order sits on the admin’s today list, shows a real total after that one call, and moves through a status the parent can see, until delivered or cancelled.

First live is Bonto free tier. Custom domain, payment gateway, and a ping when an order arrives come after this customer’s flow works.

## The Problem

A bookshop vendor takes private-school book-list orders by phone. At the start of the year the work arrives in a rush: parents read out a school list, ask to drop a title they already own, sometimes order for a second child in the same call. Some of those orders never make it onto a list the shop can work. The vendor’s job is not “sell more books.” It is to stop losing orders that were already agreed.

Phone is a bad capture tool for this. A pack is not “Grade 5.” It is a named school’s list, with specific editions, and the parent needs to subtract and change quantities. A spoken list is easy to mis-hear. A paper list on WhatsApp is easy to lose in the thread. Existing online options in this market do not close the gap: fixed per-grade bundles cannot be unticked, and “upload a photo of the list” hands the work back to the shop to interpret.

The parent should not have to call the shop to ask if the order arrived, or what it costs. Today, closing a phone-taken list means more phone.

## Who This Serves

**The vendor (one admin).** The customer this is being built for: a single shop owner who supplies private-school lists. Success is: every order a parent placed is on today’s list, with a status, a locked selection, and — after he calls once with the final price — a payable total. He checks the app daily in v1. He collects cash at the door.

**The parent.** A private-school family buying this year’s prescribed editions — or just stationery from the same shop. They need to find *their* school’s pack, drop what they already have, bump quantities, and order for more than one child without the second list overwriting the first. They must also be able to check out with only individual items. Success is: they placed what they meant, they can see it moving, and they are not guessing the final amount after confirmation.

**The delivery partner** is not a user of the app. They receive the parent’s WhatsApp number from the shop and report drop-off back to the admin, who marks Delivered.

## The Solution

Book List is a mobile-first shop and a same-feel admin, on one Node + SQLite app.

Parents create an account (name, address, WhatsApp, email/password). For packs they pick a school from a dropdown the admin maintains, filter by grade, open that pack with every title pre-selected, untick what they do not need, set quantities, and add to cart. Each add is a new cart line, so two children are two snapshots. A completely separate catalog holds individual shop items (pens, pencils, and the like): title, description, and price only. A pack is not required. Place Order stores the goods total and warns that delivery will be confirmed by the shop.

The admin works from today’s orders. He **calls the parent once**, communicates the final price (goods + delivery), sets **Order Confirmed**, and types the delivery price so the order total updates. The parent does not call in. Status then moves through processing, packing, ready, on the partner, and **Delivered**. If the shop cannot complete it, **Cancelled**. The parent can see that pipeline. Cash on delivery; a payment gateway is the next cycle, not this one.

Packs are school + grade + a short description, archived not deleted so last year’s orders keep their prices.

## What Makes This Different

This is not a generic online shop, and it is not meant to beat every bookshop website in the country. It is built to **this customer’s requirements**.

What he needs that a phone thread does not give him: the parent picks their school, edits the list (drop a book, change quantity, add a second child’s pack without overwriting the first), and the order is already on his today screen. What he needs that a fixed “Grade 5 bundle” does not give the parent: this list is *their* school’s editions, and they can take things out.

The shop’s way of closing money stays his way: he calls once with the final price, cash on delivery. The app does not try to replace that call. It makes that call the only call.

## Success Criteria

- A logged-in parent can place a pack order, an items-only order, or a mixed order, and that order appears on the admin today list with status **Order Is Placed**.
- The admin calls the parent **once** with the final price, then **Order Confirmed** holds goods + delivery. The parent does not need to call the shop.
- Every order reaches **Delivered** or **Cancelled**. Nothing sits forever in the middle without a decision.
- The vendor can add schools, grades, packs, and individual items without a deploy.
- First live URL is on Bonto free tier in time for this customer to use it before he asks for a custom domain.

Failure looks like: the admin still keeps a parallel paper or WhatsApp list because he does not trust the today view — or the parent still has to ring the shop to find out the price or whether the order exists.

## Scope

**In for v1:** signup/login; admin-managed school and grade lists; school+grade packs with description, pre-tick, locked last title, qty 1–20, cloned cart lines; separate individual-items catalog (title, description, price); mixed or items-only cart; place order; COD; admin’s one call to communicate final price, then delivery price typed at Order Confirmed; parent-visible status through Delivered/Cancelled; admin today-orders home; archive packs (hide, keep snapshots); rich animated UI on shop and admin; Bonto free tier.

**Out of v1:** payment gateway; custom domain; in-app delivery calculator at checkout; stock; extra admin accounts; delivery-partner login; password-reset email; cover images; free-text smart search; push/WhatsApp notify when an order lands (admin checks daily).

Locked pack/cart/status rules live in `addendum.md` for the PRD.

## Vision

If this works, this customer runs the next book-list season from the today list. Parents place the list; he calls once for the final price; the bag goes out. Then the same app — still his, still to his requirements — can take a custom domain, then a payment gateway next to COD, then a ping instead of opening a tab. It is not a product for other shops unless he later asks for that.
