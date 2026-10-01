import { createBrowserRouter, createRoutesFromElements, Route } from 'react-router'
import { AccountPage } from './AccountPage'
import { AuthGate } from './AuthGate'
import { BrowsePage } from './BrowsePage'
import { CartPage } from './CartPage'
import { CheckoutPage } from './CheckoutPage'
import { ItemsPage } from './ItemsPage'
import { OrdersPage } from './OrdersPage'
import { PackPage } from './PackPage'
import { Shell } from './Shell'

function BlankPage() {
  return null
}

export const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route element={<Shell />}>
        <Route index element={<BrowsePage />} />
        <Route path="items" element={<ItemsPage />} />
        <Route path="packs/:id" element={<PackPage />} />
        <Route element={<AuthGate />}>
          <Route path="cart" element={<CartPage />} />
          <Route path="cart/checkout" element={<CheckoutPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="account" element={<AccountPage />} />
        </Route>
      </Route>
      <Route path="*" element={<BlankPage />} />
    </>,
  ),
)
