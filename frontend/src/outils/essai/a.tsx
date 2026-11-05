import type { PropsOutil } from '../types';
import { VueEssai } from './vue';

/** Trial tool A (AD-133): proves the contracts, not a product screen. */
export default function EssaiA({ description }: PropsOutil) {
  return <VueEssai description={description} />;
}
