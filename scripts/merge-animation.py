"""
Transfère une animation FBX (Mixamo) sur le squelette d'un glTF.

    /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/merge-animation.py

Puis optimiser la sortie :

    npx @gltf-transform/cli optimize /tmp/eric-anim.glb public/models/eric.glb \
      --texture-compress webp --texture-size 1024 --compress false --simplify false

⚠️ Ne PAS se contenter de réassigner l'action au squelette cible, même quand les
noms d'os correspondent : une action Blender stocke des rotations relatives à la
pose de repos, et les axes d'os créés par l'importateur FBX ne coïncident pas
avec ceux de l'importateur glTF. Le résultat est une pose quasi identique au
repos — un personnage figé en T-pose qui se balance légèrement.

On passe donc par des contraintes « Copy Rotation » en espace MONDE, puis un
bake : le transfert devient indépendant des poses de repos. Seules les rotations
sont copiées, ce qui donne une marche sur place (pas de déplacement racine) et
évite le problème d'échelle entre les deux rigs (cm côté FBX).

Blender 3.5 ne lit pas EXT_texture_webp : partir du glTF d'origine, pas de
celui déjà optimisé.
"""
import bpy

GLB_IN = '/Users/bjoly/Downloads/eric.glb'
FBX_IN = '/Users/bjoly/Downloads/strut_walking.fbx'
GLB_OUT = '/tmp/eric-anim.glb'
FPS = 30

bpy.ops.wm.read_factory_settings(use_empty=True)

# 1. Le modèle : squelette + skin + textures
bpy.ops.import_scene.gltf(filepath=GLB_IN)
target = next(o for o in bpy.data.objects if o.type == 'ARMATURE')

# 2. L'animation seule
bpy.ops.import_scene.fbx(filepath=FBX_IN)
source = [o for o in bpy.data.objects if o.type == 'ARMATURE' and o is not target][0]
action = bpy.data.actions[0]
if not source.animation_data:
    source.animation_data_create()
source.animation_data.action = action

shared = sorted({b.name for b in target.data.bones} & {b.name for b in source.data.bones})
print(f"os communs : {len(shared)}")

# 3. Contraintes de rotation en espace monde
bpy.context.view_layer.objects.active = target
target.select_set(True)
bpy.ops.object.mode_set(mode='POSE')

for name in shared:
    constraint = target.pose.bones[name].constraints.new('COPY_ROTATION')
    constraint.target = source
    constraint.subtarget = name
    constraint.target_space = 'WORLD'
    constraint.owner_space = 'WORLD'

# 4. Bake : fige le résultat visuel des contraintes en clés
start, end = (int(v) for v in action.frame_range)
scene = bpy.context.scene
scene.frame_start, scene.frame_end = start, end
scene.render.fps = FPS

bpy.ops.pose.select_all(action='SELECT')
bpy.ops.nla.bake(
    frame_start=start,
    frame_end=end,
    only_selected=False,
    visual_keying=True,
    clear_constraints=True,
    clear_parents=False,
    use_current_action=False,
    bake_types={'POSE'},
)
bpy.ops.object.mode_set(mode='OBJECT')

# 5. Ménage
bpy.data.objects.remove(source, do_unlink=True)
target.animation_data.action.name = 'strut_walking'
baked = target.animation_data.action
print(f"action bakée : frames {start}-{end} @ {FPS} fps, {len(baked.fcurves)} courbes")

bpy.ops.export_scene.gltf(
    filepath=GLB_OUT,
    export_format='GLB',
    export_animations=True,
    export_nla_strips=False,
    export_frame_range=True,
    export_force_sampling=True,
    export_skins=True,
)
print('export ok')
