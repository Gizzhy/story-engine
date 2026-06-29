// Code-side prompt assembly — the consistency lever. The AI gives the variable
// parts (setting, action, who's present, outfits); code injects each present
// character's locked `identity` VERBATIM plus the scene outfit, then appends the
// fixed style block. Because the identity string is byte-identical everywhere,
// the same face renders every time. Character NAMES never appear in the output.
import { STYLE_BLOCK_A, STYLE_BLOCK_B, CAMERA_REALISM } from "../prompts/blocks";

/** Has at least the fields needed for verbatim identity injection. */
interface IdentityCharacter {
  name: string;
  identity: string;
}

interface Outfit {
  name: string;
  outfit: string;
}

interface Scene {
  setting: string;
  action: string;
  present: string[];
  outfits: Outfit[];
}

interface Hook {
  shot: string;
  present: string[];
  outfits: Outfit[];
}

interface Thumb {
  concept: string;
  featured: string[];
  outfit: Outfit[];
}

/**
 * Verbatim "identity + Wearing outfit." for each named character, joined with
 * blank lines. No names in the output. Returns "" when nobody is present.
 */
function identityBlock(
  names: string[],
  outfits: Outfit[],
  characters: IdentityCharacter[],
): string {
  if (!names || names.length === 0) return "";
  return names
    .map((name) => {
      const identity = characters.find((c) => c.name === name)?.identity ?? "";
      const outfit = outfits.find((o) => o.name === name)?.outfit ?? "";
      return `${identity} Wearing ${outfit}.`;
    })
    .join("\n\n");
}

/** Character reference prompt: identity + baseline outfit + Style Block A. */
export function referencePrompt(
  identity: string,
  baselineOutfit: string,
  mood: string,
): string {
  return (
    identity + " Wearing " + baselineOutfit + "." + "\n\n" + STYLE_BLOCK_A(mood)
  );
}

/** Scene image prompt: setting + action + present characters (verbatim) + Style Block A. */
export function scenePrompt(
  scene: Scene,
  characters: IdentityCharacter[],
  mood: string,
): string {
  const present = identityBlock(scene.present, scene.outfits, characters);
  return `${scene.setting}. ${scene.action}.\n\n${present}\n\n${STYLE_BLOCK_A(mood)}`;
}

/** Hook image prompt: shot + present characters (if any) + Style Block B. */
export function hookPrompt(
  hook: Hook,
  characters: IdentityCharacter[],
  // Hooks always use Style Block B, which is mood-independent.
  mood: string,
): string {
  void mood;
  const present = identityBlock(hook.present, hook.outfits, characters);
  const presentBlock = present ? `\n\n${present}` : "";
  return `${hook.shot}.${presentBlock}\n\n${STYLE_BLOCK_B}`;
}

/** Thumbnail image prompt: concept + featured lead (if any) + Camera-Realism. */
export function thumbnailPrompt(
  thumb: Thumb,
  characters: IdentityCharacter[],
  // Thumbnail always uses Camera-Realism, which is mood-independent.
  mood: string,
): string {
  void mood;
  const featured = identityBlock(thumb.featured, thumb.outfit, characters);
  const featuredBlock = featured ? `\n\n${featured}` : "";
  return `${thumb.concept}${featuredBlock}\n\n${CAMERA_REALISM}`;
}
