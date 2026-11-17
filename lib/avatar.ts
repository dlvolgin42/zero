// Deterministic avatars drawn on the device: the same seed always gives the same face, nothing is sent anywhere.
// Style: "Voxel Art" by DiceBear, licensed under CC0 1.0.
import { Avatar, Style } from "@dicebear/core";
import definition from "@dicebear/styles/voxel-art.json" with { type: "json" };

const style = new Style(definition);
const cache = new Map<string, string>();

// An uploaded photo is stored in the seed field itself as a small data: URL, so it is shown as is.
export const isPhoto = (seed: string) => seed.startsWith("data:image/jpeg;base64,");

export function avatarUri(seed: string): string {
  if (isPhoto(seed)) return seed;
  let uri = cache.get(seed);
  if (!uri) {
    uri = new Avatar(style, { seed }).toDataUri();
    cache.set(seed, uri);
  }
  return uri;
}
