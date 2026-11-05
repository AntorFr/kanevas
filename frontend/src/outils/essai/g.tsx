import type { PropsOutil } from '../types';
import { VueEssai } from './vue';

/** Trial tool G (AD-133): proves the contracts, not a product screen. */
export default function EssaiG({ description }: PropsOutil) {
  return <VueEssai description={description} />;
}
