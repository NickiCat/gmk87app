import type { Gmk87Api } from '../shared/api'

declare global {
  interface Window {
    gmk: Gmk87Api
  }
}
