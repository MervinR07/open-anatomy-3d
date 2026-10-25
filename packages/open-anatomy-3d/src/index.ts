import catalog from '../catalog.json'

/** Body systems. Every structure belongs to exactly one; each is a separate
 *  top-level group in the models (except `joints`, which are hotspots). */
export type AnatomySystem = 'skin' | 'skeleton' | 'joints' | 'muscles' | 'organs' | 'vessels' | 'nerves'
export type AnatomySex = 'male' | 'female'
export type Vec3 = [number, number, number]

export interface AnatomyStructure {
  /** Stable id. For mesh structures it is also the glTF node name. */
  key: string
  /** Human-readable English name, e.g. "Lung (L)". */
  label: string
  system: AnatomySystem
  /** Clinical grouping, e.g. "Cardiovascular", "Musculoskeletal". */
  category: string
  /** Suggested display colour (hex). */
  color: string
  /** Joint hotspots only: the joint centre in the male model, in metres. */
  anchor?: Vec3
  /** Joint hotspots only: the joint centre in the female model, in metres. */
  anchorFemale?: Vec3
  /** Set when the structure exists in only one of the two bodies. */
  sex?: AnatomySex
}

export const VERSION = '0.1.0'

export const SYSTEMS: readonly AnatomySystem[] = ['skin', 'skeleton', 'joints', 'muscles', 'organs', 'vessels', 'nerves']

export const SYSTEM_LABELS: Record<AnatomySystem, string> = {
  skin: 'Skin', skeleton: 'Skeleton', joints: 'Joints', muscles: 'Muscles',
  organs: 'Organs', vessels: 'Vessels', nerves: 'Nerves',
}

/** Every structure in either body: 135 meshed structures plus 12 joint hotspots. */
export const ANATOMY_STRUCTURES = catalog as AnatomyStructure[]

export const ANATOMY_BY_KEY: Readonly<Record<string, AnatomyStructure>> = Object.fromEntries(
  ANATOMY_STRUCTURES.map(s => [s.key, s]),
)

export const CATEGORIES: readonly string[] = [...new Set(ANATOMY_STRUCTURES.map(s => s.category))].sort()

/** A distinct accent colour per category, for labels, legends and callouts. */
export const CATEGORY_COLORS: Readonly<Record<string, string>> = {
  'Cardiovascular': '#e5391b',
  'Respiratory': '#2f86c9',
  'Digestive': '#d97b0b',
  'Endocrine': '#b7791f',
  'Renal / Urinary': '#1f9d8b',
  'Musculoskeletal': '#5b6b86',
  'Neurological': '#8e5bd6',
  'Eye / Sensory': '#0f8fb3',
  'Reproductive': '#d14d72',
  'Oral / ENT': '#b35c44',
  'Immune / Lymphatic': '#3a9a4f',
  'Skin': '#c9825e',
}

export function getStructure(key: string): AnatomyStructure | undefined {
  return ANATOMY_BY_KEY[key]
}

/** Structures present in the given body (drops the other sex's organs). */
export function structuresFor(sex: AnatomySex): AnatomyStructure[] {
  return ANATOMY_STRUCTURES.filter(s => !s.sex || s.sex === sex)
}

/** A joint hotspot's centre in the given body, or undefined for mesh structures. */
export function jointAnchor(structure: AnatomyStructure, sex: AnatomySex): Vec3 | undefined {
  return sex === 'female' ? structure.anchorFemale : structure.anchor
}

/** File names of the two models inside the package's `models/` folder. */
export const MODEL_FILES: Record<AnatomySex, string> = {
  male: 'anatomy-male.glb',
  female: 'anatomy-female.glb',
}

/** Default host: jsDelivr serving this exact package version from npm. */
export const DEFAULT_MODEL_BASE = `https://cdn.jsdelivr.net/npm/open-anatomy-3d@${VERSION}/models/`

/**
 * URL of a model. With no `base` it points at the jsDelivr CDN, so it works
 * without any bundler setup; pass your own base (ending in `/`) to self-host
 * the files from `node_modules/open-anatomy-3d/models/`.
 *
 * The models use EXT_meshopt_compression: give GLTFLoader a MeshoptDecoder
 * (drei's `useGLTF(url, false, true)` does this for you).
 */
export function modelUrl(sex: AnatomySex, base: string = DEFAULT_MODEL_BASE): string {
  return base + MODEL_FILES[sex]
}

/** Credit line the CC BY 4.0 licence requires wherever the models are shown. */
export const ATTRIBUTION =
  'Anatomy: BodyParts3D © The Database Center for Life Science (CC BY 4.0); ' +
  'female organs: Human Reference Atlas 3D Reference Organs, HuBMAP (CC BY 4.0); ' +
  'female body: MakeHuman (CC0). Modified by open-anatomy-3d ' +
  '(https://github.com/MervinR07/open-anatomy-3d), CC BY 4.0.'
