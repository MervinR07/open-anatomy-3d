// Structure catalog for the open-anatomy-3d build pipeline.
// Each rule claims BodyParts3D mesh files (by PART-OF concept name or by the
// file's own English name) in order — first match wins. `{s}` in a key/label
// expands to the side (_l / _r, "(L)" / "(R)").

export const SYSTEMS = ['skin', 'skeleton', 'joints', 'muscles', 'organs', 'vessels', 'nerves']

const ART = '#c0392b'
const VEIN = '#2e6db4'
const BONE = '#efe6d2'
const MUSC = '#b5463d'

const C = {
  neuro: 'Neurological', cardio: 'Cardiovascular', resp: 'Respiratory', dig: 'Digestive',
  endo: 'Endocrine', renal: 'Renal / Urinary', msk: 'Musculoskeletal', sense: 'Eye / Sensory',
  repro: 'Reproductive', skin: 'Skin', mouth: 'Oral / ENT', lymph: 'Immune / Lymphatic',
}

// Files matching any of these are dropped entirely (hollow cavities, hair,
// tiny ligaments that only add noise).
export const DROP = [
  /cavity of/, /^(lateral|third|fourth) ventricle$/, /cerebral aqueduct/,
  /anterior chamber/, /interventricular foramen/, /interpeduncular fossa/, /hair/, /eyebrow/,
  /^lip$/, /mesentery|mesocolon|mesoappendix|taenia /, /tentorium/, /interosseous membrane/,
  /flexor retinaculum/, /long plantar ligament/, /stylohyoid ligament/, /nasal cartilage|alar cartilage|septal nasal/,
  /lacrimal lake/, /^intermediate tendon$/, /pharyngeal raphe|pterygomandibular raphe/,
  /septum of telencephalon|lamina terminalis/, /external ear/,
]

// mesh: rule list. `concept` = exact PART-OF concept name (lowercase);
// `re` = regex against the file's lowercase English name with the leading
// "left "/"right " stripped.
export const RULES = [
  { key: 'skin', label: 'Skin', system: 'skin', region: 'other', category: C.skin, color: '#e9b596', re: /^skin$/ },

  // ---------- Nervous ----------
  { key: 'cerebellum', label: 'Cerebellum', system: 'organs', region: 'mind_cognitive', category: C.neuro, color: '#d99a9a', concept: ['cerebellum'] },
  { key: 'brainstem', label: 'Brainstem', system: 'organs', region: 'mind_cognitive', category: C.neuro, color: '#cf8f8f', concept: ['brainstem'], re: /^(pons|medulla oblongata|midbrain|peduncle of midbrain)$/ },
  { key: 'pituitary', label: 'Pituitary Gland', system: 'organs', region: 'digestive_endocrine', category: C.endo, color: '#e0a050', re: /pituitary/ },
  { key: 'brain', label: 'Brain', system: 'organs', region: 'mind_cognitive', category: C.neuro, color: '#e4aaa6', concept: ['brain'], re: /gyrus|sulcus|lobe$|lobule|cerebral hemisphere|corpus callosum|thalamus|hypothalamus|epithalamus|habenula|hippocamp|amygdala|caudate nucleus|putamen|globus pallidus|internal capsule|insula|fornix|commissure|mammillary|pineal|geniculate|colliculus|optic chiasm|optic tract|tuber cinereum|stria |choroid plexus|white matter|cortex of/ },
  { key: 'spinal_cord', label: 'Spinal Cord', system: 'nerves', region: 'mind_cognitive', category: C.neuro, color: '#f2d27a', re: /spinal cord/ },
  { key: 'cranial_nerves', label: 'Cranial & Eye Nerves', system: 'nerves', region: 'mind_cognitive', category: C.neuro, color: '#f2c14e', re: /nerve|ganglion/ },

  // ---------- Eyes ----------
  { key: 'eye_{s}', label: 'Eye {S}', system: 'organs', region: 'other', category: C.sense, color: '#f4f1ea', concept: ['left eyeball', 'right eyeball'], re: /eyeball|cornea|^iris$|^lens$|sclera|^choroid$|retina|vitreous|corona ciliaris|suspensory ligament of lens|lacrimal|tarsal plate|^(superior|inferior|medial|lateral) rectus$|^(superior|inferior) oblique$|levator palpebrae|trochlea of superior oblique|check ligament|common tendinous ring|nasolacrimal/ },

  // ---------- Cardiovascular (specific vessels before the generic groups) ----------
  { key: 'coronary_arteries', label: 'Coronary Arteries', system: 'vessels', region: 'cardiovascular', category: C.cardio, color: '#d6452f', concept: ['left coronary artery', 'right coronary artery'], re: /coronary artery|coronary sinus|cardiac vein/ },
  { key: 'heart', label: 'Heart', system: 'organs', region: 'cardiovascular', category: C.cardio, color: '#b8352c', concept: ['heart'], re: /wall of (atrium|ventricle)|valve|leaflet|cusp of|papillary muscle|chordae/ },
  { key: 'aorta', label: 'Aorta', system: 'vessels', region: 'cardiovascular', category: C.cardio, color: ART, concept: ['aorta'], re: /aorta$/ },
  { key: 'vena_cava_superior', label: 'Superior Vena Cava', system: 'vessels', region: 'cardiovascular', category: C.cardio, color: VEIN, re: /^superior vena cava$/ },
  { key: 'vena_cava_inferior', label: 'Inferior Vena Cava', system: 'vessels', region: 'cardiovascular', category: C.cardio, color: VEIN, re: /^inferior vena cava$/ },
  { key: 'pulmonary_vessels', label: 'Pulmonary Vessels', system: 'vessels', region: 'cardiovascular', category: C.cardio, color: '#8e4bb0', re: /pulmonary trunk|pulmonary (artery|vein)|segmental (artery|vein)|segmental branch|basal (artery|vein)|lingular (artery|vein)|lobar (artery|vein)|of .*segmental (artery|vein)/ },
  { key: 'carotid_{s}', label: 'Carotid Artery {S}', system: 'vessels', region: 'cardiovascular', category: C.cardio, color: ART, re: /^(common|internal|external) carotid artery$/ },
  { key: 'arteries_{zone}', label: 'Arteries — {ZONE}', system: 'vessels', region: 'cardiovascular', category: C.cardio, color: ART, re: /artery|arteries|arterial arch|arteria |celiac trunk|thyrocervical trunk|costocervical trunk|brachiocephalic trunk|palmar arch$|plantar arch$|branch(es)? of/ },
  { key: 'veins_{zone}', label: 'Veins — {ZONE}', system: 'vessels', region: 'cardiovascular', category: C.cardio, color: VEIN, re: /vein|venous|sinus|tributary|hepatovenous/ },

  // ---------- Respiratory ----------
  { key: 'larynx', label: 'Larynx (Voice Box)', system: 'organs', region: 'respiratory', category: C.resp, color: '#d8b8a6', re: /cartilage$|epiglott|arytenoid|cricothyroid|crico-arytenoid|thyro-arytenoid|vocal|conus elasticus|thyrohyoid membrane|thyrohyoid ligament|hyo-epiglottic|thyro-epiglottic|cricoid/ },
  { key: 'trachea', label: 'Trachea', system: 'organs', region: 'respiratory', category: C.resp, color: '#d7a9a0', re: /^trachea$/ },
  { key: 'bronchi', label: 'Bronchi', system: 'organs', region: 'respiratory', category: C.resp, color: '#e3b7ad', re: /bronch(ial tree|us)|main bronchus/ },
  { key: 'lung_{s}', label: 'Lung {S}', system: 'organs', region: 'respiratory', category: C.resp, color: '#e8a5a0', concept: ['left lung', 'right lung'], re: /bronchopulmonary segment|lobe of (left|right)? ?lung/ },
  { key: 'diaphragm', label: 'Diaphragm', system: 'muscles', region: 'respiratory', category: C.resp, color: '#b85a4a', re: /^diaphragm$/ },

  // ---------- Digestive / Endocrine ----------
  { key: 'tongue', label: 'Tongue', system: 'organs', region: 'digestive_endocrine', category: C.mouth, color: '#cf7d7d', re: /tongue|glossus|geniohyoid/ },
  { key: 'salivary_glands', label: 'Salivary Glands', system: 'organs', region: 'digestive_endocrine', category: C.mouth, color: '#e3c7a0', re: /submandibular gland|sublingual gland|parotid/ },
  { key: 'teeth', label: 'Teeth & Gums', system: 'skeleton', region: 'other', category: C.mouth, color: '#fbf8ef', re: /tooth|incisor|canine|molar|gingiva/ },
  { key: 'pharynx', label: 'Pharynx (Throat)', system: 'organs', region: 'digestive_endocrine', category: C.mouth, color: '#c98a7a', re: /pharyn|veli palatini|uvula/ },
  { key: 'esophagus', label: 'Esophagus', system: 'organs', region: 'digestive_endocrine', category: C.dig, color: '#c98a7a', re: /^esophagus$/ },
  { key: 'stomach', label: 'Stomach', system: 'organs', region: 'digestive_endocrine', category: C.dig, color: '#d49383', re: /^stomach$/ },
  { key: 'liver', label: 'Liver', system: 'organs', region: 'digestive_endocrine', category: C.dig, color: '#8a4a2e', concept: ['liver'], re: /lobe of liver|biliary tree|duct of caudate/ },
  { key: 'gallbladder', label: 'Gallbladder & Bile Ducts', system: 'organs', region: 'digestive_endocrine', category: C.dig, color: '#6b8e5a', re: /gallbladder|cystic duct|hepatic duct|bile duct/ },
  { key: 'pancreas', label: 'Pancreas', system: 'organs', region: 'digestive_endocrine', category: C.endo, color: '#e2c08d', concept: ['pancreas'], re: /pancrea/ },
  { key: 'spleen', label: 'Spleen', system: 'organs', region: 'digestive_endocrine', category: C.lymph, color: '#7a3f4a', re: /^spleen$/ },
  { key: 'thymus', label: 'Thymus', system: 'organs', region: 'other', category: C.lymph, color: '#e8c3b5', re: /thymus/ },
  { key: 'adrenal_{s}', label: 'Adrenal Gland {S}', system: 'organs', region: 'digestive_endocrine', category: C.endo, color: '#e0c068', re: /adrenal gland|suprarenal gland/ },
  { key: 'appendix', label: 'Appendix', system: 'organs', region: 'digestive_endocrine', category: C.dig, color: '#c9847a', re: /^appendix$/ },
  { key: 'rectum', label: 'Rectum & Anus', system: 'organs', region: 'digestive_endocrine', category: C.dig, color: '#b8735f', re: /^rectum$|anal canal/ },
  { key: 'small_intestine', label: 'Small Intestine', system: 'organs', region: 'digestive_endocrine', category: C.dig, color: '#d99a88', concept: ['small intestine'], re: /duodenum|jejunum|ileum$|ileocecal/ },
  { key: 'colon', label: 'Large Intestine (Colon)', system: 'organs', region: 'digestive_endocrine', category: C.dig, color: '#c07a64', concept: ['large intestine'], re: /colon|cecum/ },

  // ---------- Renal / Urinary / Reproductive ----------
  { key: 'kidney_{s}', label: 'Kidney {S}', system: 'organs', region: 'renal_urinary', category: C.renal, color: '#8a3f35', re: /^kidney$/ },
  { key: 'ureter_{s}', label: 'Ureter {S}', system: 'organs', region: 'renal_urinary', category: C.renal, color: '#b07a70', re: /^ureter$/ },
  { key: 'bladder', label: 'Urinary Bladder', system: 'organs', region: 'renal_urinary', category: C.renal, color: '#d9a36a', re: /urinary bladder|urethra/ },
  { key: 'prostate', label: 'Prostate', system: 'organs', region: 'renal_urinary', category: C.repro, color: '#c98f86', re: /^prostate$/ },
  { key: 'reproductive', label: 'Reproductive Organs', system: 'organs', region: 'other', category: C.repro, color: '#d6a08c', re: /testis|epididymis|deferent duct|seminal vesicle|penis/ },

  // ---------- Skeleton ----------
  { key: 'skull', label: 'Skull', system: 'skeleton', region: 'joints_mobility', category: C.msk, color: BONE, re: /^(frontal|parietal|occipital|temporal|sphenoid|nasal|lacrimal|palatine|zygomatic) bone$|^ethmoid$|^maxilla$|^vomer$|inferior nasal concha/ },
  { key: 'mandible', label: 'Jaw (Mandible)', system: 'skeleton', region: 'joints_mobility', category: C.msk, color: BONE, re: /^mandible$|^hyoid bone$/ },
  { key: 'spine_cervical', label: 'Cervical Spine (Neck)', system: 'skeleton', region: 'joints_mobility', category: C.msk, color: BONE, re: /cervical vertebra|^atlas$|^axis$|disk of (axis|.*cervical)/ },
  { key: 'spine_thoracic', label: 'Thoracic Spine', system: 'skeleton', region: 'joints_mobility', category: C.msk, color: BONE, re: /thoracic vertebra/ },
  { key: 'spine_lumbar', label: 'Lumbar Spine (Lower Back)', system: 'skeleton', region: 'joints_mobility', category: C.msk, color: BONE, re: /lumbar vertebra|^intervertebral disk$/ },
  { key: 'pelvis', label: 'Pelvis & Sacrum', system: 'skeleton', region: 'joints_mobility', category: C.msk, color: BONE, re: /^hip bone$|^sacrum$|coccyx|coccygeal vertebra/ },
  { key: 'sternum', label: 'Sternum', system: 'skeleton', region: 'joints_mobility', category: C.msk, color: BONE, re: /sternum|manubrium|xiphoid/ },
  { key: 'ribs_{s}', label: 'Ribs {S}', system: 'skeleton', region: 'joints_mobility', category: C.msk, color: BONE, re: / rib$|costal cartilage/ },
  { key: 'clavicle_{s}', label: 'Collarbone {S}', system: 'skeleton', region: 'joints_mobility', category: C.msk, color: BONE, re: /^clavicle$/ },
  { key: 'scapula_{s}', label: 'Shoulder Blade {S}', system: 'skeleton', region: 'joints_mobility', category: C.msk, color: BONE, re: /^scapula$/ },
  { key: 'humerus_{s}', label: 'Upper Arm Bone {S}', system: 'skeleton', region: 'joints_mobility', category: C.msk, color: BONE, re: /^humerus$/ },
  { key: 'forearm_{s}', label: 'Forearm Bones {S}', system: 'skeleton', region: 'joints_mobility', category: C.msk, color: BONE, re: /^radius$|^ulna$/ },
  { key: 'hand_{s}', label: 'Hand {S}', system: 'skeleton', region: 'joints_mobility', category: C.msk, color: BONE, re: /^(scaphoid|lunate|triquetral|pisiform|trapezium|trapezoid|capitate|hamate)$|metacarpal|phalanx of .*(finger|thumb)|phalanx of thumb/ },
  { key: 'femur_{s}', label: 'Thigh Bone (Femur) {S}', system: 'skeleton', region: 'joints_mobility', category: C.msk, color: BONE, re: /^femur$/ },
  { key: 'patella_{s}', label: 'Kneecap {S}', system: 'skeleton', region: 'joints_mobility', category: C.msk, color: BONE, re: /^patella$/ },
  { key: 'lower_leg_{s}', label: 'Shin Bones {S}', system: 'skeleton', region: 'joints_mobility', category: C.msk, color: BONE, re: /^tibia$|^fibula$/ },
  { key: 'foot_{s}', label: 'Foot {S}', system: 'skeleton', region: 'joints_mobility', category: C.msk, color: BONE, re: /^talus$|^calcaneus$|cuboid|navicular|cuneiform bone|metatarsal|phalanx of .*toe|sesamoid bone of foot/ },

  // ---------- Muscles ----------
  { key: 'neck_muscles_{s}', label: 'Neck Muscles {S}', system: 'muscles', region: 'joints_mobility', category: C.msk, color: MUSC, re: /sternocleidomastoid|scalenus|longus colli|longus capitis|rectus capitis|obliquus capitis|platysma|omohyoid|sternohyoid|sternothyroid|^thyrohyoid$|digastric|^stylohyoid$|mylohyoid|intertransversarii|interspinales cervicis/ },
  { key: 'trapezius_{s}', label: 'Trapezius {S}', system: 'muscles', region: 'joints_mobility', category: C.msk, color: MUSC, re: /trapezius/ },
  { key: 'deltoid_{s}', label: 'Deltoid (Shoulder) {S}', system: 'muscles', region: 'joints_mobility', category: C.msk, color: MUSC, re: /deltoid/ },
  { key: 'rotator_cuff_{s}', label: 'Rotator Cuff {S}', system: 'muscles', region: 'joints_mobility', category: C.msk, color: MUSC, re: /supraspinatus|infraspinatus|teres minor|subscapularis/ },
  { key: 'shoulder_muscles_{s}', label: 'Shoulder Girdle Muscles {S}', system: 'muscles', region: 'joints_mobility', category: C.msk, color: MUSC, re: /teres major|rhomboid|levator scapulae|serratus|pectoralis minor|subclavius/ },
  { key: 'chest_muscles_{s}', label: 'Chest (Pectoral) Muscle {S}', system: 'muscles', region: 'joints_mobility', category: C.msk, color: MUSC, re: /pectoralis major/ },
  { key: 'upper_arm_muscles_{s}', label: 'Upper Arm Muscles {S}', system: 'muscles', region: 'joints_mobility', category: C.msk, color: MUSC, re: /biceps brachii|^brachialis$|coracobrachialis|triceps brachii|anconeus/ },
  { key: 'hand_muscles_{s}', label: 'Hand Muscles {S}', system: 'muscles', region: 'joints_mobility', category: C.msk, color: MUSC, re: /of hand$|pollicis brevis|opponens pollicis|adductor pollicis|lumbricals of hand|interossei of hand/ },
  { key: 'forearm_muscles_{s}', label: 'Forearm Muscles {S}', system: 'muscles', region: 'joints_mobility', category: C.msk, color: MUSC, re: /carpi|digitorum superficialis|digitorum profundus|pollicis longus|palmaris|pronator|extensor digitorum$|extensor digiti minimi|extensor indicis|brachioradialis|supinator/ },
  { key: 'back_muscles_{s}', label: 'Back Muscles {S}', system: 'muscles', region: 'joints_mobility', category: C.msk, color: MUSC, re: /iliocostalis|longissimus|spinalis|semispinalis|rotator$|multifidus|interspinal|intertransversarius|levatores costarum|splenius/ },
  { key: 'intercostals_{s}', label: 'Intercostal Muscles {S}', system: 'muscles', region: 'respiratory', category: C.resp, color: MUSC, re: /intercostal|transversus thoracis/ },
  { key: 'abdominal_muscles', label: 'Abdominal Wall Muscles', system: 'muscles', region: 'joints_mobility', category: C.msk, color: MUSC, re: /oblique$|transversus abdominis|rectus abdominis|linea alba|pyramidalis/ },
  { key: 'pelvic_floor', label: 'Pelvic Floor', system: 'muscles', region: 'renal_urinary', category: C.renal, color: MUSC, re: /coccygeus|pubococcygeus|puborectalis|anal sphincter|levator ani/ },
  { key: 'iliopsoas_{s}', label: 'Hip Flexor (Iliopsoas) {S}', system: 'muscles', region: 'joints_mobility', category: C.msk, color: MUSC, re: /psoas|iliacus/ },
  { key: 'gluteal_{s}', label: 'Gluteal Muscles {S}', system: 'muscles', region: 'joints_mobility', category: C.msk, color: MUSC, re: /gluteus|tensor fasciae latae|iliotibial tract|piriformis|gemellus|obturator|quadratus femoris/ },
  { key: 'foot_muscles_{s}', label: 'Foot Muscles {S}', system: 'muscles', region: 'joints_mobility', category: C.msk, color: MUSC, re: /of foot$|hallucis brevis|adductor hallucis|abductor hallucis|flexor digitorum brevis|flexor accessorius/ },
  { key: 'quadriceps_{s}', label: 'Quadriceps (Front Thigh) {S}', system: 'muscles', region: 'joints_mobility', category: C.msk, color: MUSC, re: /rectus femoris|vastus|sartorius/ },
  { key: 'hamstrings_{s}', label: 'Hamstrings (Back Thigh) {S}', system: 'muscles', region: 'joints_mobility', category: C.msk, color: MUSC, re: /biceps femoris|semitendinosus|semimembranosus/ },
  { key: 'adductors_{s}', label: 'Inner Thigh (Adductors) {S}', system: 'muscles', region: 'joints_mobility', category: C.msk, color: MUSC, re: /adductor (brevis|longus|magnus|minimus)|gracilis|pectineus/ },
  { key: 'calf_{s}', label: 'Calf Muscles {S}', system: 'muscles', region: 'joints_mobility', category: C.msk, color: MUSC, re: /gastrocnemius|soleus|plantaris|popliteus|calcaneal tendon|tibialis posterior|flexor digitorum longus|flexor hallucis longus/ },
  { key: 'shin_muscles_{s}', label: 'Shin Muscles {S}', system: 'muscles', region: 'joints_mobility', category: C.msk, color: MUSC, re: /tibialis anterior|extensor digitorum longus|extensor hallucis longus|fibularis/ },
]

// Joint hotspots — no mesh of their own in BodyParts3D (no capsules), so each
// is a glowing, clickable sphere placed at the real joint centre computed
// from the adjoining bones' ends.
export const JOINTS = [
  { key: 'shoulder_{s}', label: 'Shoulder Joint {S}' },
  { key: 'elbow_{s}', label: 'Elbow Joint {S}' },
  { key: 'wrist_{s}', label: 'Wrist Joint {S}' },
  { key: 'hip_{s}', label: 'Hip Joint {S}' },
  { key: 'knee_{s}', label: 'Knee Joint {S}' },
  { key: 'ankle_{s}', label: 'Ankle Joint {S}' },
]

export const ZONES = {
  head: 'Head & Neck', arm_l: 'Left Arm', arm_r: 'Right Arm', thorax: 'Chest',
  abdomen: 'Abdomen', pelvis: 'Pelvis', leg_l: 'Left Leg', leg_r: 'Right Leg',
}

// Body zone from a mesh's bbox centre (BodyParts3D mm, Z-up, +X = patient's left).
export function zoneOf([x, , z]) {
  if (z > 1390 && Math.abs(x) < 140) return 'head'
  if (Math.abs(x) > 165 && z > 650) return x > 0 ? 'arm_l' : 'arm_r'
  if (z > 1160) return 'thorax'
  if (z > 960) return 'abdomen'
  if (z > 780 && Math.abs(x) < 200) return 'pelvis'
  return x > 0 ? 'leg_l' : 'leg_r'
}
