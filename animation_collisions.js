(function() {
	function makeTexture(texture_name, dataUrl) {
		let texture = new Texture({
			mode: 'bitmap',
			keep_size: true,
			name: texture_name
		})
		
		texture.fromDataURL(dataUrl).add(false).select()

		return texture
	}
	
	function resize(obj, val, axis, negative, allow_negative, bidirectional, not_relative) {
		let source_vertices = typeof val == 'number' ? obj.oldVertices : obj.vertices
		
		if (!source_vertices) {
			source_vertices = obj.vertices
		}
		
		let selected_vertices = Project.mesh_selection[obj.uuid]?.vertices || Object.keys(obj.vertices)
		let range = [Infinity, -Infinity]
		let {vec1, vec2} = Reusable
		let rotation_inverted = new THREE.Euler().copy(Transformer.rotation_selection).invert()
		selected_vertices.forEach(key => {
			vec1.fromArray(source_vertices[key]).applyEuler(rotation_inverted)
			range[0] = Math.min(range[0], vec1.getComponent(axis))
			range[1] = Math.max(range[1], vec1.getComponent(axis))
		})
		
		let center = bidirectional ? (range[0] + range[1]) / 2 : (negative ? range[1] : range[0])
		let size = Math.abs(range[1] - range[0])
		if (typeof val !== 'number') {
			val = val(size) - size
			if (bidirectional) val /= 2
		}
		let scale
		
		if (not_relative) {
			scale = (val * (negative ? -1 : 1)) / size
		} else {
			scale = (size + val * (negative ? -1 : 1) * (bidirectional ? 2 : 1)) / size
		}
		
		if (isNaN(scale) || Math.abs(scale) == Infinity) scale = 1
		if (scale < 0 && !allow_negative) scale = 0
		
		selected_vertices.forEach(key => {
			vec1.fromArray(source_vertices[key]).applyEuler(rotation_inverted)
			vec2.fromArray(obj.vertices[key]).applyEuler(rotation_inverted)
			vec2.setComponent(axis, (vec1.getComponent(axis) - center) * scale + center)
			vec2.applyEuler(Transformer.rotation_selection)
			obj.vertices[key].replace(vec2.toArray())
		})
		obj.preview_controller.updateGeometry(obj)
	}
	
	function resizeMesh(obj, modify, axis) {
		if (obj.resizable) {
			resize(obj, modify, axis, false, true, obj instanceof Mesh, true)
		} else if (obj.scalable) {
			obj.scale[axis] = modify(obj.scale[axis])
			obj.preview_controller.updateTransform(obj)
			if (obj.preview_controller.updateGeometry) obj.preview_controller.updateGeometry(obj)
		}
	}
	
	function generateBlank(texture_name, width, height, color) {
		let canvas = document.createElement('canvas')
		canvas.width = width
		canvas.height = height
		let ctx = canvas.getContext('2d')

		if (color) {
			ctx.fillStyle = new tinycolor(color).toRgbString()
			ctx.fillRect(0, 0, width, height)
		}
		let texture = makeTexture(texture_name, canvas.toDataURL())
		texture.uv_width = width
		texture.uv_height = height

		return texture
	}
	
	function textureFromCanvas(texture_name, width, height, target_canvas, sx, sy, sw, sh) {
		let canvas = document.createElement('canvas')
		canvas.width = width
		canvas.height = height
		let ctx = canvas.getContext('2d')
		
		ctx.drawImage(target_canvas, sx, sy, sw, sh, 0, 0, width, height)
		
		let texture = makeTexture(texture_name, canvas.toDataURL())
		texture.uv_width = width
		texture.uv_height = height

		return texture
	}
	
	let random_values = {}
	
	function textureFromCanvasRepeat(texture_name, width, height, target_canvas, sx, sy, sw, sh, rx, ry, random_rotate = false) {
		let canvas = document.createElement('canvas')
		canvas.width = width * rx
		canvas.height = height * ry
		brush_canvas = document.createElement('canvas')
		brush_canvas.width = width
		brush_canvas.height = height
		let ctx = canvas.getContext('2d')
		let brush_ctx = brush_canvas.getContext('2d')
		
		for (let x = 0; x < rx; x++) {
			for (let y = 0; y < ry; y++) {
				brush_ctx.clearRect(0, 0, brush_canvas.width, brush_canvas.height)
				
				if (random_rotate) {
					brush_ctx.save()
					brush_ctx.translate(brush_canvas.width / 2, brush_canvas.height / 2)
					
					if (random_values[x + '_' + y]) {
						brush_ctx.rotate(random_values[x + '_' + y])
					} else {
						random_values[x + '_' + y] = 90 * (Math.PI / 180) * Math.floor(Math.random() * 4)
						brush_ctx.rotate(random_values[x + '_' + y])
					}

					brush_ctx.translate(-brush_canvas.width / 2, -brush_canvas.height / 2)
				}
				
				brush_ctx.drawImage(target_canvas, sx, sy, sw, sh, 0, 0, width, height)
				ctx.drawImage(brush_canvas, x * width, y * height)
				
				if (random_rotate) {
					brush_ctx.restore()
				}
			}
		}
		
		let texture = makeTexture(texture_name, canvas.toDataURL())
		texture.uv_width = 16
		texture.uv_height = 16

		return texture
	}
	
	let tile_size = 16
	
	let project_path = ''
	
	function getValue(name, checkbox_type) {
		return !checkbox_type ? document.querySelector(`#${name}`).value : document.querySelector(`#${name}:checked`) ? true : false
	}
	
	function setValue(name, value) {
		document.querySelector(`#${name}`).value = value
	}
	
	function setToDefaultValues() {
		tile_size = 16
	
		project_path = ''
		
		localStorage.setItem('animation_collisions_tile_size', tile_size)
		localStorage.setItem('animation_collisions_project_path', project_path)
	}
	
	const node_path = require('node:path')
	const node_fs = require('node:fs')
	
	let exportButton
	
	Plugin.register('animation_collisions', {
		title: 'Generate animation collisions',
		author: 'Wantear',
		icon: 'fa-ghost',
		description: `Generate animation collisions`,
		version: '1.0.0',
		variant: 'both',
		onload() {
            exportButton = new Action('generate_animation_collisions', {
                name: 'Generate animation collisions',
				category: 'edit',
                description: `Generate animation collisions`,
                icon: 'fa-ghost',
                click () {
					if (localStorage.getItem('animation_collisions_tile_size')) {
						tile_size = localStorage.getItem('animation_collisions_tile_size')
					}
					
					if (localStorage.getItem('animation_collisions_project_path')) {
						project_path = localStorage.getItem('animation_collisions_project_path')
					}
					
					let dialog = new Dialog('options', {
						title: 'Generate animation collisions',
						width: 590,
						lines: [
							`<div style="margin-bottom: 15px;"><div style="display: inline-block; width: 225px;">Tile size:</div><input type="number" id="tile_size" value="${tile_size}" style="border: 1px solid #ccc; padding: 5px; width: 300px;"/></div>`,
							`<div style="margin-bottom: 15px;"><div style="display: inline-block; width: 225px;">RPG in a Box project folder:</div><input type="text" id="project_path" value="${project_path}" style="border: 1px solid #111; padding: 5px; width: 300px;" readonly/></div>`
						],
						buttons: ['dialog.confirm', 'Set to default values', 'Select project folder', 'dialog.cancel'],
						onButton (button) {
							if (button === 1) {
								setToDefaultValues()
							} else if (button === 2) {
								let directory = Blockbench.pickDirectory({
									starspath: project_path ? project_path : Project.save_path,
									title: 'Select the RPG in a Box project folder'
								})
								
								if (directory !== null) {
									project_path = directory
									localStorage.setItem('animation_collisions_project_path', project_path)
								}
							}
						},
						onConfirm () {
							tile_size = getValue('tile_size')
							localStorage.setItem('animation_collisions_tile_size', tile_size)
							
							let animations = Animation.all
					
							for (let animation of animations) {
								let animators = animation.animators
								
								let export_animation = false
								
								let collisions_by_time = {}
							
								let animation_length = 0
								
								for (let animator_uuid in animators) {
									let animator = animators[animator_uuid]
									
									if (animator.name.indexOf('collision') > -1 && animator.position.length > 0) {
										if (animation_length === 0) {
											animation_length = animation.length
											export_animation = true
										}
										
										let animator_position = animator.position
										let animator_scale = animator.scale
										
										let scale
										
										for (let i = 0; i < animator_position.length; i++) {
											let keyframe = animator_position[i]
											
											let position = keyframe.data_points[0]
											
											if (animator_scale[i]) {
												scale = animator_scale[i].data_points[0]
											}
											
											if (!collisions_by_time[keyframe.time]) {
												collisions_by_time[keyframe.time] = []
											}
											
											collisions_by_time[keyframe.time].push({
												name: animator.name,
												x: Number(position.x),
												y: -Number(position.z),
												z: Number(position.y),
												sx: Number(scale.x) * 16,
												sy: Number(scale.z) * 16,
												sz: Number(scale.y) * 16
											})
										}
									}
								}
								
								if (export_animation) {
									let collisions = []
								
									let time_values = Object.keys(collisions_by_time).sort()
									
									let relative_time_value = 0
									
									for (let j = 0; j < 10; j++) {
										for (let i = 0; i < time_values.length / 2; i++) {
											if (!time_values[i * 2 + 1]) {
												break
											}
											
											let frame_start_time = time_values[i * 2]
											let frame_end_time = time_values[i * 2 + 1]
											let frame_start = collisions_by_time[frame_start_time]
											let frame_end = collisions_by_time[frame_end_time]
											
											let t = Number(frame_end_time) - Number(frame_start_time)
											
											let time_value = String(Number(frame_start_time) + (t / 2))
											
											if (t / 2 > 0.05) {
												let all_equal = true
												
												if (!collisions_by_time[time_value]) {
													collisions_by_time[time_value] = []
												}
												
												for (let frame_value_start of frame_start) {
													for (let frame_value_end of frame_end) {
														if (frame_value_start.name === frame_value_end.name) {
															let equal = false
														
															if (frame_value_start.x === frame_value_end.x &&
																frame_value_start.y === frame_value_end.y &&
																frame_value_start.z === frame_value_end.z &&
																frame_value_start.sx === frame_value_end.sx &&
																frame_value_start.sy === frame_value_end.sy &&
																frame_value_start.sz === frame_value_end.sz) {
																equal = true
															} else {
																all_equal = false
															}
															
															if (!equal) {
																collisions_by_time[time_value].push({
																	name: frame_value_start.name,
																	x: frame_value_start.x + (frame_value_end.x - frame_value_start.x) / 2,
																	y: frame_value_start.y + (frame_value_end.y - frame_value_start.y) / 2,
																	z: frame_value_start.z + (frame_value_end.z - frame_value_start.z) / 2,
																	sx: frame_value_start.sx + (frame_value_end.sx - frame_value_start.sx) / 2,
																	sy: frame_value_start.sy + (frame_value_end.sy - frame_value_start.sy) / 2,
																	sz: frame_value_start.sz + (frame_value_end.sz - frame_value_start.sz) / 2
																})
															}
															
															break
														}
													}
												}
												
												if (all_equal) {
													delete collisions_by_time[time_value]
												}
											}
										}
										
										time_values = Object.keys(collisions_by_time).sort()
									}
									
									for (let time_key of time_values) {
										let time_key_value = Number(time_key)	
										
										collisions.push(time_key_value - relative_time_value)
										collisions.push(collisions_by_time[time_key])
										
										relative_time_value = time_key_value
									}
									
									if (collisions[0] === 0) {
										collisions[0] = 0.00001
									}
									
									if (animation_length - Number(time_values[time_values.length - 1]) > 0) {
										collisions.push(animation_length - Number(time_values[time_values.length - 1]))
									} else {
										collisions.push(0.00001)
									}
									
									let angle_values = []
									
									for (let i = 0; i < 360; i++) {
										let angle_value = []
										
										let x = 360 - i
			
										let s = Math.sin(x * (Math.PI / 180))
										let c = Math.cos(x * (Math.PI / 180))
										
										for (let collision of collisions) {
											if (Array.isArray(collision)) {
												let zone_values = []
												
												for (let zone_value of collision) {
													let zone_x = (zone_value.x / tile_size) * c - (zone_value.y / tile_size) * s
													let zone_y = (zone_value.x / tile_size) * s + (zone_value.y / tile_size) * c
													let zone_z = zone_value.z
													
													let zone_sx = zone_value.sx
													let zone_sy = zone_value.sy
													
													if ((i >= 0 && i < 90) || (i >= 180 && i < 270)) {
														zone_sx = zone_value.sx + ((zone_value.sy - zone_value.sx) * (i % 90 / 90))
														zone_sy = zone_value.sy + ((zone_value.sx - zone_value.sy) * (i % 90 / 90))
													} else if ((i >= 90 && i < 180) || (i >= 270 && i < 360)) {
														zone_sx = zone_value.sx + ((zone_value.sy - zone_value.sx) * (1 - (i % 90 / 90)))
														zone_sy = zone_value.sy + ((zone_value.sx - zone_value.sy) * (1 - (i % 90 / 90)))
													}
													
													let zone_sz = zone_value.sz
													
													zone_values.push([
														zone_value.name,
														zone_x,
														zone_y,
														zone_z,
														zone_sx,
														zone_sy,
														zone_sz
													])
												}
												
												angle_value.push(zone_values)
											} else {
												angle_value.push(collision)
											}
										}
										
										angle_values.push(angle_value)
									}
									
									folder_path = node_path.dirname(Project.save_path)
									
									if (project_path === '') {
										node_fs.mkdirSync(node_path.join(folder_path, 'data'), { recursive: true })
										
										let file_path = node_path.join(folder_path, 'data', `${animation.name}.json`)
										Blockbench.writeFile(file_path, {
											content: JSON.stringify(angle_values)
										}, (path) => {
											Blockbench.showQuickMessage(`Saved to ${file_path}`, 1500)
										})
									} else {		
										node_fs.mkdirSync(node_path.join(project_path, 'data'), { recursive: true })
										
										let file_path = node_path.join(project_path, 'data', `${animation.name}.json`)
										Blockbench.writeFile(file_path, {
											content: JSON.stringify(angle_values)
										}, (path) => {
											Blockbench.showQuickMessage(`Saved to ${file_path}`, 1500)
										})
									}
								}
							}
						}
					})
					
					dialog.show()
				}
			})
            MenuBar.addAction(exportButton, 'edit')
        },
        onunload() {
            exportButton.delete()
			localStorage.removeItem('animation_collisions_project_path')
			localStorage.removeItem('animation_collisions_tile_size')
        }
	});

})();
