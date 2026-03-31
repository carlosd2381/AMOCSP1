import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { env } from './env'

let stripePromise: Promise<Stripe | null>

export const getStripe = () => {
  if (!stripePromise) {
    stripePromise = loadStripe(env.stripePublicKey || 'pk_test_placeholder')
  }
  return stripePromise
}
