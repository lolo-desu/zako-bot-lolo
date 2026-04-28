import type { Ref } from 'vue'
import { useModelPlatforms } from './composables/modelPlatforms'

type ModelPlatformsResult = ReturnType<typeof useModelPlatforms>

declare const result: ModelPlatformsResult

const loaded: Ref<boolean> = result.loaded

void loaded
