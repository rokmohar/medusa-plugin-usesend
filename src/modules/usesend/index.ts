import { Module } from '@medusajs/framework/utils'
import Loader from './loaders'
import { UseSendService } from './services'

export * from './services'
export * from './types'

export default Module('usesend', {
  service: UseSendService,
  loaders: [Loader],
})
