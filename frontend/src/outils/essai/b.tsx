import type { PropsOutil } from '../types';
import { VueEssai } from './vue';

/** Trial tool B (AD-133): proves the contracts, not a product screen. */
export default function EssaiB({ description }: PropsOutil) {
  return <VueEssai description={description} />;
}
