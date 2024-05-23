(function() {
	var exportButton;
	
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
				
				copied_bone['name'] += 'XY'
				copied_bone['uuid'] += 'XY'
				
				bone['children'] = [copied_bone]
				
				duplicate_bones(children, bones_uuid, bones_uuid_names)
			}
		}
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
            exportButton = new Action('export_to_rpg_in_a_box', {
                name: 'Export to RPG in a Box',
				category: 'file',
                description: 'Export to RPG in a Box',
                icon: 'fa-file-export',
                click: function() {
					Blockbench.readFile(Project.save_path, {}, (files) => {						
						let data = JSON.parse(files[0].content)
						
						let elements = data['elements']
						let outliner = data['outliner']
						let animations = data['animations'] ? data['animations'] : null
						
						// console.log(sort_uvs)
						
						for (let element of elements) {
							let faces = element['faces']
							let new_faces = {}
							
							for (let k in faces) {
								let faces_value = faces[k]
								
								let uv = faces_value['uv']
        
								let values = Object.values(uv)
								let uvs_x = []
								let uvs_y = []
								
								for (let value of values) {
									uvs_x.push(value[0])
									uvs_y.push(value[1])
								}
								
								let uv_center_x = sum(uvs_x) / len(uvs_x)
								let uv_center_y = sum(uvs_y) / len(uvs_y)
								
								let uvs_sorted = [...items(uv)].sort((a, b) => {
									a = sort_uvs(a, uv_center_x, uv_center_y)
									b = sort_uvs(b, uv_center_x, uv_center_y)
									
									if (a < b) {
										return 1
									}
									
									if (a > b) {
										return -1
									}

									return 0
								})
								
								for (let i = 0; i < 3; i++) {
									new_faces[k + i.toString()] = {
										'uv': uv,
										'vertices': [...uvs_sorted.slice(i), ...uvs_sorted.slice(0, i)].map(v => v[0])
									}
									
									if ('texture' in faces_value) {
										new_faces[k + i]['texture'] = faces_value['texture']
									}
								}
								
								for (let i = 0; i < 4; i++) {
									let vertices = [...uvs_sorted.slice(i), ...uvs_sorted.slice(0, i)].map(v => v[0])
									vertices.reverse()
									
									new_faces[k + i.toString() + i.toString()] = {
										'uv': uv,
										'vertices': vertices
									}
									
									if ('texture' in faces_value) {
										new_faces[k + i.toString() + i.toString()]['texture'] = faces_value['texture']
									}
								}
								
								let uv_start_index = 3
								
								uvs_sorted = [...uvs_sorted.slice(uv_start_index), ...uvs_sorted.slice(0, uv_start_index)]
								
								uvs_only_keys = uvs_sorted.map(v => v[0])
								
								faces_value['vertices'] = uvs_only_keys
							}
							
							update_object(faces, new_faces)
							
							// console.log(element)
						}
						
						let bones_origin = {}
						let bones_uuid = []
						let bones_uuid_names = {}
						
						let root_bone_origin = outliner[0]['origin']
						bones_origin[outliner[0]['name']] = outliner[0]['origin']
						get_bones_origin(outliner[0]['children'], [0, 0, 0], bones_origin)
						duplicate_bones(outliner, bones_uuid, bones_uuid_names)
						
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
											
											let data_points = keyframe['data_points']
											
											for (let data_point of data_points) {
												copied_data_points.push({
													'x': data_point['x'],
													'y': data_point['y'],
													'z': '0'
												})
											
												data_point['x'] = '0'
												data_point['y'] = '0'
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
            });
            MenuBar.addAction(exportButton, 'file.export.0');
        },
        onunload() {
            exportButton.delete();
        }
	});

})();
