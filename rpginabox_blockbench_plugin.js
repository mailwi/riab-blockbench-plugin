(function() {
	var exportButton, exportButton2, exportButton3, exportButton4
	
	Math.degrees = function(radians) {
		return radians * 180 / Math.PI
	}
	
	function sort_uvs(v, uv_center_x, uv_center_y) {
		return Math.degrees(Math.atan2(v[1][0] - uv_center_x, -v[1][1] - uv_center_y))
	}
	
	function sum(arr) {
		return arr.reduce((s, a) => s + a, 0)
	}
	
	function len(arr) {
		return arr.length
	}
	
	function items(obj) {
		let arr = []
		
		for (let k in obj) {
			arr.push([k, obj[k]])
		}
		
		return arr
	}
	
	function update_object(obj, obj1) {
		for (let k in obj1) {
			obj[k] = obj1[k]
		}
	}
				
	function get_bones_origin(outliner, origin, bones_origin) {
		for (let bone of outliner) {
			if (typeof bone === 'object' && !Array.isArray(bone) && bone !== null) {
				let bone_origin = bone['origin'].map((c, i) => c - origin[i])
				bones_origin[bone['name']] = bone_origin
				
				get_bones_origin(bone['children'], bone['origin'], bones_origin)
			}
		}
	}
				
	function duplicate_bones(outliner, bones_uuid, bones_uuid_names) {
		for (let bone of outliner) {
			if (typeof bone === 'object' && !Array.isArray(bone) && bone !== null) {
				bones_uuid.push(bone['uuid'])
				bones_uuid_names[bone['uuid']] = bone['name']
				
				let children = bone['children']
				
				let copied_bone = { ...bone }
				
				copied_bone.rotation = [0, 0, 0]
				
				copied_bone['name'] += 'XY'
				copied_bone['uuid'] += 'XY'
				
				bone['children'] = [copied_bone]
				
				duplicate_bones(children, bones_uuid, bones_uuid_names)
			}
		}
	}
	
	function transfer_origin(mesh, origin) {
		let q = new THREE.Quaternion() // .copy(mesh.quaternion)
		
		let shift = new THREE.Vector3(
			mesh.origin[0] - origin[0],
			mesh.origin[1] - origin[1],
			mesh.origin[2] - origin[2]
		)
		
		shift.applyQuaternion(q.invert())
		shift = shift.toArray()
		
		for (let vkey in mesh.vertices) {
			mesh.vertices[vkey].V3_add(shift)
		}
		
		mesh.origin.V3_set(origin)
	}
	
	function apply_mesh_rotation(mesh) {
		let vec = new THREE.Vector3()

		let rotation = new THREE.Euler(Math.degToRad(mesh.rotation[0]), Math.degToRad(mesh.rotation[1]), Math.degToRad(mesh.rotation[2]))
		
		for (let vkey in mesh.vertices) {
			vec.fromArray(mesh.vertices[vkey])
			vec.applyEuler(rotation)
			mesh.vertices[vkey].V3_set(vec.x, vec.y, vec.z)
		}
		
		mesh.rotation.V3_set(0, 0, 0)
	}
	
	function get_parent(meshes, children) {
		for (let bone of children) {
			if (typeof bone === 'object' && !Array.isArray(bone) && bone !== null) {
				if (len(bone['children']) > 0 && typeof bone['children'][0] === 'string') {
					for (let mesh_uuid of bone['children']) {
						let mesh = meshes[mesh_uuid][0]
						
						meshes[mesh_uuid][1].vertices = mesh.vertices
					}
				} else {
					get_parent(meshes, bone['children'])
				}
			}
		}
	}
	
	function get_bones(bones, children, rotation, origin) {
		if (!rotation) {
			rotation = []
			origin = []
		}
		
		for (let bone of children) {
			if (typeof bone === 'object' && !Array.isArray(bone) && bone !== null) {
				let bone_rotation
				
				if (bone.rotation) {
					bone_rotation = [bone.rotation[0], bone.rotation[1], bone.rotation[2]]
				} else {
					bone_rotation = [0, 0, 0]
				}
				
				bone.rotation = [0, 0, 0]
				
				let bone_origin = [bone.origin[0], bone.origin[1], bone.origin[2]]
				
				// console.log(bone.name, JSON.stringify([...rotation, bone_rotation]), JSON.stringify([...origin, bone_origin]))
				
				bones[bone.uuid] = [bone, [...rotation, bone_rotation], [...origin, bone_origin]]
				
				get_bones(bones, bone['children'], [...rotation, bone_rotation], [...origin, bone_origin])
			}
		}
	}
	
	function bake_ik_animation(animation, converted_animation) {
		let ik_samples = animation.sampleIK(animation.snapping)
		
		for (let uuid in ik_samples) {
			let animator = animation.animators[uuid];
			ik_samples[uuid].forEach(({array}) => {
				array[0] = Math.roundTo(array[0], 4);
				array[1] = Math.roundTo(array[1], 4);
				array[2] = Math.roundTo(array[2], 4);
			})
			ik_samples[uuid].forEach(({array}, i) => {
				let before = ik_samples[uuid][i-1];
				let after = ik_samples[uuid][i+1];
				if ((!before || before.array.equals(array)) && (!after || after.array.equals(array))) return;

				let time = Timeline.snapTime(i / animation.snapping, animation);
				let values = {x: array[0], y: array[1], z: array[2]};
				
				if (!(uuid in converted_animation.animators)) {
					converted_animation.animators[uuid] = {
						'name': animator.name,
						'type': 'bone',
						'keyframes': []
					}
				}
				
				let keyframes = converted_animation.animators[uuid]['keyframes']
				
				keyframes.push({
					"channel": "rotation",
					"data_points": [
						values
					],
					"uuid": guid(),
					"time": time,
					"color": -1,
					"interpolation": "linear",
					"bezier_linked": true,
					"bezier_left_time": [-0.1, -0.1, -0.1],
					"bezier_left_value": [0, 0, 0],
					"bezier_right_time": [0.1, 0.1, 0.1],
					"bezier_right_value": [0, 0, 0]
				})
			})
		}
	}
	
	function projectIntoOwnPlane(polygon) {
		if (polygon.length < 3) {
			return
		}
		
		const plane = new THREE.Plane()
		plane.setFromCoplanarPoints(polygon[0], polygon[1], polygon[2])
		return projectOnPlane(polygon, plane)
	}
	
	const reusableObject = new THREE.Object3D()
	reusableObject.rotation.order = "XYZ"
	function rotationFromDirection(
		target,
		targetEuler = new THREE.Euler(),
		{ rotateX = 0, rotateY = 0, rotateZ = 0 } = {}
	) {
		reusableObject.lookAt(target)
		reusableObject.rotateX(Math.degToRad(90))
		reusableObject.rotateX(rotateX)
		reusableObject.rotateY(rotateY)
		reusableObject.rotateZ(rotateZ)

		targetEuler.copy(reusableObject.rotation)
		return targetEuler
	}
	
	const reusableQuat1 = new THREE.Quaternion()
	const reusableEuler1$1 = new THREE.Euler()
	const reusableVec5$1 = new THREE.Vector3()
	function projectOnPlane(polygonOrPoint, plane) {
		const euler = rotationFromDirection(plane.normal, reusableEuler1$1)
		const quat = reusableQuat1.setFromEuler(euler)
		quat.invert()

		if (polygonOrPoint instanceof Array) {
		  return polygonOrPoint.map((e) => {
			reusableVec5$1.copy(e)
			reusableVec5$1.applyQuaternion(quat)
			return new THREE.Vector2(reusableVec5$1.x, reusableVec5$1.z)
		  })
		}
		reusableVec5$1.copy(polygonOrPoint)
		reusableVec5$1.applyQuaternion(quat)
		return new THREE.Vector2(reusableVec5$1.x, reusableVec5$1.z)
	}
	
	function xKey(obj) {
		if (obj instanceof THREE.Vector3 || obj instanceof THREE.Vector2) {
		  return "x"
		}
		if (obj instanceof Array) {
		  return 0
		}
		return null
	}
	
	function yKey(obj) {
		if (obj instanceof THREE.Vector3 || obj instanceof THREE.Vector2) {
		  return "y"
		}
		if (obj instanceof Array) {
		  return 1
		}
		return null
	}
	
	function zKey(obj) {
		if (obj instanceof THREE.Vector3) {
		  return "z"
		}
		if (obj instanceof Array) {
		  return 2
		}
		return null
	}

	function getX(obj) {
		return obj[xKey(obj)]
	}
	
	function getY(obj) {
		return obj[yKey(obj)]
	}
	
	function getZ(obj) {
		return obj[zKey(obj)] ?? 0
	}
	
	function lineSide(p, p1, p2) {
		return Math.sign((p.x - p2.x) * (p1.y - p2.y) - (p1.x - p2.x) * (p.y - p2.y))
	}
	
	function isPointInTriangle(point, point1, point2, point3) {
		const d1 = lineSide(point, point1, point2)
		const d2 = lineSide(point, point2, point3)
		const d3 = lineSide(point, point3, point1)
		const hasNegative = d1 < 0 || d2 < 0 || d3 < 0
		const hasPositive = d1 > 0 || d2 > 0 || d3 > 0

		return !(hasNegative && hasPositive)
	}
	
	function isPolygonClockWise(polygon) {
		if (polygon.length <= 2) {
		  return true
		}
		let sum = 0
		for (let i = 0; i < polygon.length; i++) {
		  const vertexA = polygon[i]
		  const vertexB = polygon[(i + 1) % polygon.length]
		  sum += (getX(vertexB) - getX(vertexA)) * (getY(vertexB) - getY(vertexA))
		}
		return sum >= 0
	}
	
	function getAdjacentElements(arr, index) {
		return [
		  arr[(index + 1 + arr.length) % arr.length],
		  arr[index],
		  arr[(index - 1 + arr.length) % arr.length]
		]
	}
	
	function triangulate(polygon) {
		const vertices3d = polygon.map((v) => v.V3_toThree())
		const indices = Array.from(Array(vertices3d.length).keys())
		const triangles = []

		const vertices = projectIntoOwnPlane(vertices3d)
		const isClockWise = isPolygonClockWise(vertices)

		const SAFETY_LIMIT = 100
		let safetyIndex = 0
		while (indices.length > 3 && safetyIndex <= SAFETY_LIMIT) {
		  for (let i = 0; i < indices.length; i++) {
			const [a, b, c] = getAdjacentElements(indices, i)

			const vecAC = vertices[c].clone().sub(vertices[a])
			const vecAB = vertices[b].clone().sub(vertices[a])

			const cross = vecAC.x * vecAB.z - vecAC.z * vecAB.x
			const isConcave = isClockWise ? cross <= 0 : cross >= 0
			if (isConcave) continue

			let someVertexLiesInsideEar = false
			for (let j = 0; j < vertices.length; j++) {
			  if (j === a || j === b || j === c) continue

			  someVertexLiesInsideEar = isPointInTriangle(
				vertices[j],
				vertices[a],
				vertices[b],
				vertices[c]
			  )
			  if (someVertexLiesInsideEar) break
			}
			if (!someVertexLiesInsideEar) {
			  triangles.push([a, b, c].sort((a, b) => b - a))
			  indices.splice(i, 1)
			  break;
			}
		  }
		  safetyIndex++
		}

		triangles.push(indices.sort((a, b) => b - a))

		return triangles
	}
	
	function convert(ignore_elements = false, triangulate_faces = false, additional_face = false) {
		Blockbench.readFile(Project.save_path, {}, (files) => {						
			let data = JSON.parse(files[0].content)
			
			let elements = data['elements']
			let outliner = data['outliner']
			let animations = data['animations'] ? data['animations'] : null
			
			let meshes = {}
			let bones = {}
			
			get_bones(bones, outliner)
			
			for (let m of Mesh.all) {
				meshes[m.uuid] = m
				apply_mesh_rotation(m)
			}
			
			let elements_to_delete = []
			
			for (let element of elements) {
				let mesh = meshes[element.uuid]
				
				if (!mesh) {
					elements_to_delete.push(element)
				}
			}
			
			let i = 0
			let elements_length = elements.length
			while (i < elements_length) {
				if (elements[i].name.indexOf('collision') > -1 || elements_to_delete.includes(elements[i])) {
					// console.log(elements[i].name)
					elements.splice(i, 1)
					elements_length = elements.length
				} else {
					i += 1
				}
			}
			
			i = 0
			for (let bone of outliner) {
				if (bone.name === 'collisions') {
					// console.log('collisions')
					outliner.splice(i, 1)
					break
				}
				
				i += 1
			}
			
			if (animations !== null) {
				for (let animation of animations) {
					let animators = animation['animators']
					
					let i = 0
					
					let animators_length = animators.length
					let animators_keys = Object.keys(animators)
					
					for (let animator_uuid of animators_keys) {
						let animator = animators[animator_uuid]
						
						if (animator.name.indexOf('collision') > -1) {
							// console.log(animator.name)
							delete animators[animator_uuid]
						}
					}
				}
				
				let i = 0
				for (let animation of Animation.all) {
					let animators = animation['animators']
					
					let animators_keys = Object.keys(animators)
					
					let animation_baked = false
					
					for (let animator_uuid of animators_keys) {
						let animator = animators[animator_uuid]
						
						if (animator.type === 'null_object') {
							if (!animation_baked) {
								bake_ik_animation(animation, animations[i])
								
								animation_baked = true
							}
							
							delete animations[i]['animators'][animator_uuid]
						}
					}
					
					i += 1
				}
			}
			
			// console.log(sort_uvs)
			
			if (!ignore_elements) {
				for (let element of elements) {
					let faces = element['faces']
					let new_faces = {}
					
					let mesh = meshes[element.uuid]
					
					let mesh_faces = mesh.faces
					
					for (let k in faces) {
						if (triangulate_faces) {
							let mesh_face = mesh_faces[k]
							
							let mesh_vertices = mesh_face.getSortedVertices()
							if (!(mesh_vertices.length <= 3)) {
								let triangles = triangulate(
									mesh_vertices.map((key) => mesh.vertices[key]),
									mesh_face.getNormal(true)
								)
							  
								let faces_value = faces[k]
							
								let uv = faces_value['uv']

								let values = Object.values(uv)
								
								let vertices = faces_value['vertices']
							  
								for (let i = 0; i < triangles.length; i++) {
									let vertices_copy = [
										mesh_vertices[triangles[i][0]],
										mesh_vertices[triangles[i][2]],
										mesh_vertices[triangles[i][1]]
									]

									new_faces[k + i] = {
										'uv': uv,
										'vertices': vertices_copy
									}	

									if ('texture' in faces_value) {
										new_faces[k + i]['texture'] = faces_value['texture']
									}
								}
								
								delete faces[k]
							}
						} else {
							let faces_value = faces[k]
						
							let uv = faces_value['uv']

							let values = Object.values(uv)
							
							let vertices = faces_value['vertices']
							
							let mesh_face = mesh_faces[k]
							
							if (additional_face) {
								vertices_copy = [...vertices.slice(2, 4), ...vertices.slice(0, 2)]
								
								new_faces[k + '0'] = {
									'uv': uv,
									'vertices': vertices_copy
								}
								
								if ('texture' in faces_value) {
									new_faces[k + '0']['texture'] = faces_value['texture']
								}
							}
							
							if (mesh_face.vertices.length == 4) {
								let new_vertices = mesh_face.getSortedVertices()
								faces_value['vertices'] = new_vertices
							}
						}
					}
					
					update_object(faces, new_faces)
					
					// console.log(element)
				}
			}
			
			let bones_origin = {}
			let bones_uuid = []
			let bones_uuid_names = {}
			
			let root_bone_origin = outliner[0]['origin']
			bones_origin[outliner[0]['name']] = outliner[0]['origin']
			get_bones_origin(outliner[0]['children'], [0, 0, 0], bones_origin)
			duplicate_bones(outliner, bones_uuid, bones_uuid_names)
			
			// console.log(bones_origin)
			
			if (animations !== null) {
				for (let animation of animations) {
					let animators = animation['animators']

					let animator_ids = Object.keys(animators)
					
					let filter_bones_uuid = bones_uuid.filter((uuid) => !(uuid in animators))
					
					// console.log('filtered bones uuid:', len(filter_bones_uuid))
					
					if (len(filter_bones_uuid) > 0) {
						for (let uuid of filter_bones_uuid) {
							animators[uuid] = {
								"name": bones_uuid_names[uuid],
								"type": "bone",
								"keyframes": [{
									"channel": "position",
									"data_points": [
										{
											"x": "0",
											"y": "0",
											"z": "0"
										}
									],
									"uuid": "start_position_" + bones_uuid_names[uuid],
									"time": 0,
									"color": -1,
									"interpolation": "linear",
									"bezier_linked": true,
									"bezier_left_time": [-0.1, -0.1, -0.1],
									"bezier_left_value": [0, 0, 0],
									"bezier_right_time": [0.1, 0.1, 0.1],
									"bezier_right_value": [0, 0, 0]
								}]
							}
							
							animator_ids.push(uuid)
						}
					}
					
					for (let animator_id of animator_ids) {
						let animator = animators[animator_id]
						let keyframes = animator['keyframes']
						
						let animator_name = animator['name']
						
						animators[animator_id + 'XY'] = {
							'name': animator_name + 'XY',
							'type': 'bone',
							'keyframes': []
						}
						
						let duplicate_keyframes = animators[animator_id + 'XY']['keyframes']
						
						let filter_keyframes_position = keyframes.filter(
							(keyframe) => keyframe['time'] === 0 && keyframe['channel'] === 'position'
						)
						
						let filter_keyframes_rotation = keyframes.filter(
							(keyframe) => keyframe['time'] === 0 && keyframe['channel'] === 'rotation'
						)
						
						let filter_keyframes_scale = keyframes.filter(
							(keyframe) => keyframe['time'] === 0 && keyframe['channel'] === 'scale'
						)
						
						if (len(filter_keyframes_position) === 0) {
							// console.log(animator_name + ' adding start position!')
							keyframes.unshift({
								"channel": "position",
								"data_points": [
									{
										"x": "0",
										"y": "0",
										"z": "0"
									}
								],
								"uuid": "start_position_" + animator_id,
								"time": 0,
								"color": -1,
								"interpolation": "linear",
								"bezier_linked": true,
								"bezier_left_time": [-0.1, -0.1, -0.1],
								"bezier_left_value": [0, 0, 0],
								"bezier_right_time": [0.1, 0.1, 0.1],
								"bezier_right_value": [0, 0, 0]
							})
						}
						
						if (len(filter_keyframes_rotation) === 0) {
							// console.log(animator_name + ' adding start rotation!')
							keyframes.unshift({
								"channel": "rotation",
								"data_points": [
									{
										"x": "0",
										"y": "0",
										"z": "0"
									}
								],
								"uuid": "start_rotation_" + animator_id,
								"time": 0,
								"color": -1,
								"interpolation": "linear",
								"bezier_linked": true,
								"bezier_left_time": [-0.1, -0.1, -0.1],
								"bezier_left_value": [0, 0, 0],
								"bezier_right_time": [0.1, 0.1, 0.1],
								"bezier_right_value": [0, 0, 0]
							})
						}
						
						if (len(filter_keyframes_scale) === 0) {
							// console.log(animator_name + ' adding start scale!')
							keyframes.unshift({
								"channel": "scale",
								"data_points": [
									{
										"x": "1",
										"y": "1",
										"z": "1"
									}
								],
								"uuid": "start_scale_" + animator_id,
								"time": 0,
								"color": -1,
								"uniform": false,
								"interpolation": "linear",
								"bezier_linked": true,
								"bezier_left_time": [-0.1, -0.1, -0.1],
								"bezier_left_value": [0, 0, 0],
								"bezier_right_time": [0.1, 0.1, 0.1],
								"bezier_right_value": [0, 0, 0]
							})
						}
						
						for (let keyframe of keyframes) {
							if (keyframe['channel'] === 'position') {
								let data_points = keyframe['data_points']
								
								let origin = bones_origin[animator_name]
								
								for (let data_point of data_points) {
									if (origin === root_bone_origin) {   
										data_point['x'] = (-(Number(data_point['x']) - origin[0])).toString()
										data_point['y'] = (Number(data_point['y']) + origin[1]).toString()
										data_point['z'] = (Number(data_point['z']) + origin[2]).toString()
									}
									else
									{
										data_point['x'] = (-(Number(data_point['x']) - origin[0])).toString()
										data_point['y'] = (Number(data_point['y']) + origin[1]).toString()
										data_point['z'] = (Number(data_point['z']) + origin[2]).toString()
									}
									// console.log(animator_name, data_point)
								}
							}
							
							if (keyframe['channel'] === 'rotation') {
								let copied_keyframe = { ...keyframe }
								let copied_data_points = []
								
								let bone = bones[animator_id]
								
								let bone_rotation = bone[1][bone[1].length - 1]
								
								let data_points = keyframe['data_points']
								
								for (let data_point of data_points) {
									copied_data_points.push({
										'x': (Number(data_point['x']) - bone_rotation[0]).toString(),
										'y': (Number(data_point['y']) - bone_rotation[1]).toString(),
										'z': '0'
									})
								
									data_point['x'] = '0'
									data_point['y'] = '0'
									data_point['z'] = (Number(data_point['z']) + bone_rotation[2]).toString()
								}
								
								copied_keyframe['data_points'] = copied_data_points
								
								duplicate_keyframes.push(copied_keyframe)
							}
						}
					}
				}
			}
			
			Blockbench.writeFile(`${Project.save_path.split('.bbmodel')[0]}_converted.bbmodel`, {
				content: JSON.stringify(data)
			}, (path) => {
				Blockbench.showQuickMessage(`Saved to ${path}`, 1500)
			})
		})
	}

	Plugin.register('rpginabox_blockbench_plugin', {
		title: 'RPG in a Box Export',
		author: 'Wantear',
		icon: 'fa-file-export',
		description: `Export blockbench model with some fixes to RPG in a Box.
Requirements:
	1) There must be a root bone!!!
	2) Don\'t use cubes, isn\'t supported.
	3) Use only one texture.
`,
		version: '1.0.0',
		variant: 'both',
		onload() {
            exportButton = new Action('export_to_rpg_in_a_box_basic', {
                name: 'Export to RPG in a Box (Basic)',
				category: 'file',
                description: 'Export to RPG in a Box (Basic)',
                icon: 'fa-file-export',
                click: function() {
					convert()
				}
            });
            MenuBar.addAction(exportButton, 'file.export.0');
			
			exportButton2 = new Action('export_to_rpg_in_a_box_triangulate', {
                name: 'Export to RPG in a Box (Triangulate)',
				category: 'file',
                description: 'Export to RPG in a Box (Triangulate)',
                icon: 'fa-file-export',
                click: function() {
					convert(false, true)
				}
            });
            MenuBar.addAction(exportButton2, 'file.export.1');
			
			exportButton3 = new Action('export_to_rpg_in_a_box_additional_face', {
                name: 'Export to RPG in a Box (Additional face)',
				category: 'file',
                description: 'Export to RPG in a Box (Additional face)',
                icon: 'fa-file-export',
                click: function() {
					convert(false, true, true)
				}
            });
            MenuBar.addAction(exportButton3, 'file.export.2');
			
			exportButton4 = new Action('export_to_rpg_in_a_box_ignore_meshes', {
                name: 'Export to RPG in a Box (Ignore meshes)',
				category: 'file',
                description: 'Export to RPG in a Box (Ignore meshes)',
                icon: 'fa-file-export',
                click: function() {
					convert(true)
				}
            });
            MenuBar.addAction(exportButton4, 'file.export.3');
        },
        onunload() {
            exportButton.delete()
			exportButton2.delete()
			exportButton3.delete()
			exportButton4.delete()
        }
	});

})();
