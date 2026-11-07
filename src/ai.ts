import { mistral } from '@ai-sdk/mistral'

// Reads MISTRAL_API_KEY from the environment.
export const model = mistral('open-mistral-nemo')
