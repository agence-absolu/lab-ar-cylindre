import bpy, math
from mathutils import Vector

OUT = '<assets>'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='/tmp/eric-final.glb')
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
actions = {a.name: a for a in bpy.data.actions}
print('actions:', list(actions))
if not arm.animation_data:
    arm.animation_data_create()
for t in list(arm.animation_data.nla_tracks):
    arm.animation_data.nla_tracks.remove(t)

cam_data = bpy.data.cameras.new('cam')
cam_data.lens = 85
cam = bpy.data.objects.new('cam', cam_data)
bpy.context.collection.objects.link(cam)
cam.location = Vector((0, -4.2, 0.5))
cam.rotation_euler = (math.radians(90), 0, 0)
bpy.context.scene.camera = cam

def lampe(nom, loc, energie, taille):
    d = bpy.data.lights.new(nom, 'AREA'); d.energy = energie; d.size = taille
    o = bpy.data.objects.new(nom, d); bpy.context.collection.objects.link(o)
    o.location = Vector(loc)
    o.rotation_euler = (math.radians(60), 0, math.radians(35))
    return o

lampe('key', (2.5, -3, 3), 900, 4)
lampe('fill', (-3, -2, 1.5), 300, 5)

sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE'
sc.render.film_transparent = True
sc.render.resolution_x, sc.render.resolution_y = 520, 760
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Standard'

# 4 poses puisées dans les clips disponibles
choix = []
noms = list(actions)
for cible, frame in [('walk', 12), ('swing', 40), ('samba', 120), ('swing', 95)]:
    nom = next((n for n in noms if cible in n), noms[0])
    choix.append((actions[nom], frame))

for i, (act, frame) in enumerate(choix):
    arm.animation_data.action = act
    sc.frame_set(int(min(max(frame, act.frame_range[0]), act.frame_range[1])))
    sc.render.filepath = f'{OUT}/eric_{i}.png'
    bpy.ops.render.render(write_still=True)
print('panneaux rendus')
