/**
 * Mesure l'encombrement RÉELLEMENT RENDU d'un modèle.
 *
 * ⚠️ Sur un maillage skinné, `geometry.attributes.position` contient la pose de
 * liaison, pas ce que le GPU affiche : le skinning applique les matrices d'os,
 * qui peuvent déplacer et redimensionner franchement le résultat. Mesuré sur ce
 * modèle : géométrie brute `y ∈ [-0.49, 0.49]`, pose rendue `y ∈ [0, 1.87]` —
 * presque le double, et entièrement au-dessus de l'origine.
 *
 * `SkinnedMesh.getVertexPosition()` applique la même transformation que le
 * shader : c'est la seule mesure qui corresponde à l'image.
 *
 * (`Box3.setFromObject` ne convient pas non plus : sur un SkinnedMesh il
 * calcule la boîte de la pose courante puis la met en cache, donc le résultat
 * dépend de l'instant de l'appel.)
 */

// Un sommet sur 7 : l'enveloppe est stable bien avant d'avoir tout parcouru.
const SAMPLE_STEP = 7

/**
 * @param {THREE.Object3D} root      racine du modèle
 * @param {THREE.Object3D} reference objet dont l'espace local sert de repère
 * @returns {THREE.Box3} boîte exprimée dans l'espace local de `reference`
 */
export const measureRenderedBox = (root, reference) => {
  reference.updateMatrixWorld(true)

  const toReference = new THREE.Matrix4().copy(reference.matrixWorld).invert()
  const relative = new THREE.Matrix4()
  const point = new THREE.Vector3()
  const box = new THREE.Box3()

  root.traverse((node) => {
    if (!node.isMesh) return
    const positions = node.geometry.attributes.position
    if (!positions) return

    relative.multiplyMatrices(toReference, node.matrixWorld)
    for (let i = 0; i < positions.count; i += SAMPLE_STEP) {
      if (node.isSkinnedMesh) {
        node.getVertexPosition(i, point)
      } else {
        point.fromBufferAttribute(positions, i)
      }
      box.expandByPoint(point.applyMatrix4(relative))
    }
  })

  return box
}
