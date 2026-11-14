// Deterministic avatars drawn on the device: the same seed always gives the same face, nothing is sent anywhere.
// Style: "Voxel Art" by DiceBear, licensed under CC0 1.0.
import { Avatar, Style } from "@dicebear/core";
import definition from "@dicebear/styles/voxel-art.json" with { type: "json" };

const style = new Style(definition);
const cache = new Map<string, string>();

export function avatarUri(seed: string): string {
  let uri = cache.get(seed);
  if (!uri) {
    uri = new Avatar(style, { seed }).toDataUri();
    cache.set(seed, uri);
  }
  return uri;
}
