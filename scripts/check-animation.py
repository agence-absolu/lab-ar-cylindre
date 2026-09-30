"""
Vérifie qu'une animation squelettique est réellement exploitable.

    /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/check-animation.py

Mesure le déplacement des extrémités (main, pied) rapporté à la distance
hanches→tête — une normalisation qui neutralise les unités et l'échelle du rig.

Ordres de grandeur pour une marche :
    correct    main ~80-100 %, pied ~100-150 %
    inerte     < 10 %   → l'animation ne produit presque rien (T-pose animée)
    cassé      > 500 %  → les membres explosent

⚠️ À lancer sur TOUT résultat de retargeting avant de l'intégrer. Vérifier que
« des valeurs changent » ne prouve rien : une T-pose animée et un maillage qui
explose font tous les deux bouger les matrices.
"""
import bpy

def mesure(path, importer, label):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    (bpy.ops.import_scene.gltf if importer == 'gltf' else bpy.ops.import_scene.fbx)(filepath=path)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    if not bpy.data.actions:
        print(f"{label}: aucune action"); return
    if not arm.animation_data:
        arm.animation_data_create()
    # les pistes NLA masqueraient l'action qu'on veut évaluer
    for piste in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(piste)
    scene = bpy.context.scene

    def wpos(name):
        pb = arm.pose.bones.get(name)
        return (arm.matrix_world @ pb.matrix).to_translation() if pb else None

    print(f"\n{label}")
    for act in bpy.data.actions:
        arm.animation_data.action = act
        start, end = (int(v) for v in act.frame_range)
        scene.frame_set(start)
        hips, head = wpos('mixamorig:Hips'), wpos('mixamorig:Head')
        ref = (head - hips).length      # même espace, unités neutralisées

        noms = ['mixamorig:LeftHand', 'mixamorig:LeftFoot', 'mixamorig:Hips']
        traces = {n: [] for n in noms}
        pas = max(1, (end - start) // 60)   # échantillonnage : O(n²) plus loin
        for f in range(start, end + 1, pas):
            scene.frame_set(f)
            for n in traces:
                traces[n].append(wpos(n))

        mesures = {n: max((a - b).length for a in p for b in p) / ref * 100
                   for n, p in traces.items()}
        print(f"   clip '{act.name}' ({end - start + 1} frames) : "
              f"main {mesures['mixamorig:LeftHand']:.0f} %, "
              f"pied {mesures['mixamorig:LeftFoot']:.0f} %, "
              f"dérive racine {mesures['mixamorig:Hips']:.0f} %")

# Adapter les chemins à vérifier :
mesure('/tmp/eric-final.glb', 'gltf', 'modèle Eric — tous les clips')
