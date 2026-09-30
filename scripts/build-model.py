"""
Construit le modèle animé à partir du FBX Mixamo (auto-rig) + les textures du
dossier OBJ d'origine.

    /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/build-model.py

Puis optimiser :

    npx @gltf-transform/cli optimize /tmp/eric-final.glb public/models/eric.glb \
      --texture-compress webp --texture-size 1024 --compress false --simplify false

Le FBX Mixamo « with skin » contient maillage + squelette + animation issus
d'une seule source : aucun retargeting, donc aucun problème de pose de repos.
Il ne manque que les textures, que Mixamo ne réexporte pas.

Le glTF attend UNE texture metallicRoughness (G = rugosité, B = métallicité) ;
Tripo en fournit deux séparées. Le nœud « Separate Color » ci-dessous est le
montage que l'exportateur glTF de Blender sait reconnaître pour la recombiner.
"""
import bpy

# Le premier FBX fournit le maillage et le squelette ; les suivants ne
# contribuent que leur animation. Tous viennent du MEME personnage Mixamo,
# donc le rig est identique — aucun retargeting.
CLIPS = [
    ('walk',  '/Users/bjoly/Downloads/strut_walking_from_obj.fbx'),
    ('swing', '/Users/bjoly/Downloads/swing_dancing.fbx'),
    ('samba', '/Users/bjoly/Downloads/samba_dancing.fbx'),
]
TEX_DIR = '/Users/bjoly/Downloads/eric_obj'
BASECOLOR = f'{TEX_DIR}/3d_cartoon_character_basecolor.JPEG'
NORMAL = f'{TEX_DIR}/3d_cartoon_character_normal.JPEG'
METALROUGH = '/tmp/eric_metalrough.png'
GLB_OUT = '/tmp/eric-final.glb'
FPS = 30

bpy.ops.wm.read_factory_settings(use_empty=True)

# --- Import du modèle + de tous les clips ---------------------------------
bpy.ops.import_scene.fbx(filepath=CLIPS[0][1])
mesh = next(o for o in bpy.data.objects if o.type == 'MESH')
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
action = bpy.data.actions[0]
action.name = CLIPS[0][0]
action.use_fake_user = True
actions = [action]

for nom, chemin in CLIPS[1:]:
    avant = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=chemin)
    nouveaux = set(bpy.data.objects) - avant
    autre_arm = next(o for o in nouveaux if o.type == 'ARMATURE')
    act = autre_arm.animation_data.action
    act.name = nom
    act.use_fake_user = True      # sinon Blender la purge une fois détachée
    actions.append(act)
    autre_arm.animation_data.action = None
    for o in nouveaux:            # on ne garde que l'action
        bpy.data.objects.remove(o, do_unlink=True)

print(f"maillage {len(mesh.data.vertices)} sommets, {len(mesh.data.polygons)} faces, "
      f"{len(arm.data.bones)} os")
for a in actions:
    print(f"  clip '{a.name}' : {a.frame_range[1] - a.frame_range[0] + 1:.0f} frames")

# --- Matériau PBR ---------------------------------------------------------
mat = bpy.data.materials.new('eric')
mat.use_nodes = True
nodes, links = mat.node_tree.nodes, mat.node_tree.links
nodes.clear()

out = nodes.new('ShaderNodeOutputMaterial')
bsdf = nodes.new('ShaderNodeBsdfPrincipled')
links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])

base = nodes.new('ShaderNodeTexImage')
base.image = bpy.data.images.load(BASECOLOR)
links.new(base.outputs['Color'], bsdf.inputs['Base Color'])

mr = nodes.new('ShaderNodeTexImage')
mr.image = bpy.data.images.load(METALROUGH)
mr.image.colorspace_settings.name = 'Non-Color'
sep = nodes.new('ShaderNodeSeparateColor')
links.new(mr.outputs['Color'], sep.inputs['Color'])
links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])

nrm = nodes.new('ShaderNodeTexImage')
nrm.image = bpy.data.images.load(NORMAL)
nrm.image.colorspace_settings.name = 'Non-Color'
nmap = nodes.new('ShaderNodeNormalMap')
links.new(nrm.outputs['Color'], nmap.inputs['Color'])
links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])

mesh.data.materials.clear()
mesh.data.materials.append(mat)

# --- Normalisation d'échelle ---------------------------------------------
# Le FBX est en centimètres : l'importateur laisse l'armature à l'échelle 0.01
# et le modèle sort à ~0.0001 unité. Le calage au runtime le remettrait à la
# bonne taille, mais un facteur de plusieurs milliers sur un maillage skinné
# invite les artefacts de précision. On ramène donc la hauteur à 1 unité.
bpy.context.view_layer.update()
coords = [mesh.matrix_world @ v.co for v in mesh.data.vertices]
hauteur = max(c.z for c in coords) - min(c.z for c in coords)
facteur = 1.0 / hauteur
arm.scale = tuple(v * facteur for v in arm.scale)
bpy.context.view_layer.update()
print(f"hauteur {hauteur:.6f} → facteur {facteur:.1f} → 1.0 unité")

# --- Une piste NLA par clip : c'est ainsi que l'exportateur glTF produit
#     plusieurs animations nommées dans un seul fichier.
if not arm.animation_data:
    arm.animation_data_create()
arm.animation_data.action = None
for a in actions:
    piste = arm.animation_data.nla_tracks.new()
    piste.name = a.name
    piste.strips.new(a.name, int(a.frame_range[0]), a)

scene = bpy.context.scene
scene.frame_start = min(int(a.frame_range[0]) for a in actions)
scene.frame_end = max(int(a.frame_range[1]) for a in actions)
scene.render.fps = FPS

bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format='GLB', export_animations=True,
                          # Blender 3.5 : export_nla_strips=True exporte une
                          # animation glTF nommée par piste NLA.
                          # (export_animation_mode n'existe qu'à partir de 3.6)
                          export_nla_strips=True, export_frame_range=False,
                          export_force_sampling=True, export_skins=True)
print('export ok')
