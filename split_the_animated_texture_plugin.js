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
	
	let repeat_value_x = 1
	let repeat_value_y = 1
	
	let texture_width = 16
	let texture_height = 16
	
	let animation_speed = 10
	
	let random_rotate = false
	
	function getValue(name, checkbox_type) {
		return !checkbox_type ? document.querySelector(`#${name}`).value : document.querySelector(`#${name}:checked`) ? true : false
	}
	
	function setValue(name, value) {
		document.querySelector(`#${name}`).value = value
	}
	
	function setToDefaultValues() {
		repeat_value_x = 1
		repeat_value_y = 1
		
		texture_width = 16
		texture_height = 16
		
		animation_speed = 10
		
		random_rotate = false
	}
	
	let exportButton
	
	Plugin.register('split_the_animated_texture_plugin', {
		title: 'Split the animated texture',
		author: 'Wantear',
		icon: 'fa-star',
		description: `Use in a new project (the plugin removes textures except the animated texture and all bones except the root one when executed). There should be only one animated texture and no others. Need to create a root bone.`,
		version: '1.0.0',
		variant: 'both',
		onload() {
            exportButton = new Action('split_the_animated_texture', {
                name: 'Split the animated texture',
				category: 'edit',
                description: `Use in a new project (the plugin removes textures except the animated texture and all bones except the root one when executed). There should be only one animated texture and no others. Need to create a root bone.`,
                icon: 'fa-star',
                click: function() {
					let dialog = new Dialog('options', {
						title: 'Split the animated texture',
						width: 450,
						lines: [
							`<div style="margin-bottom: 15px;"><div style="display: inline-block; width: 225px;">Repeat X:</div><input type="number" id="repeat_value_x" value="${repeat_value_x}" style="border: 1px solid #ccc; padding: 5px;"></div>`,
							`<div style="margin-bottom: 15px;"><div style="display: inline-block; width: 225px;">Repeat Y:</div><input type="number" id="repeat_value_y" value="${repeat_value_y}" style="border: 1px solid #ccc; padding: 5px;"></div>`,
							`<div style="margin-bottom: 15px;"><div style="display: inline-block; width: 225px;">Texture width:</div><input type="number" id="texture_width" value="${texture_width}" style="border: 1px solid #ccc; padding: 5px;"></div>`,
							`<div style="margin-bottom: 15px;"><div style="display: inline-block; width: 225px;">Texture height:</div><input type="number" id="texture_height" value="${texture_height}" style="border: 1px solid #ccc; padding: 5px;"></div>`,
							`<div style="margin-bottom: 15px;"><div style="display: inline-block; width: 225px;">Animation speed:</div><input type="number" id="animation_speed" value="${animation_speed}" style="border: 1px solid #ccc; padding: 5px;"></div>`,
							`<div style="margin-bottom: 15px;"><div style="display: inline-block; width: 225px;">Random:</div><input type="checkbox" id="random_rotate" name="random_rotate" style="padding: 5px;" ${random_rotate ? 'checked' : ''}></div>`
						],
						buttons: ['dialog.confirm', 'Set to default values', 'dialog.cancel'],
						onButton (button) {
							if (button === 1) {
								setToDefaultValues()
							}
						},
						onConfirm () {
							repeat_value_x = getValue('repeat_value_x')
							repeat_value_y = getValue('repeat_value_y')
							
							texture_width = getValue('texture_width')
							texture_height = getValue('texture_height')
							
							animation_speed = getValue('animation_speed')
							
							random_rotate = getValue('random_rotate', true)
							
							let root = Blockbench.Outliner.root[0]
					
							let t = Texture.all[0]
							
							let models_count = t.height / t.width
							
							while (root.children.length > 0) {
								root.children[0].remove()
							}
							
							while (Texture.all.length > 1) {
								Texture.all[1].remove(true)
							}
							
							let texture_name = t.name.split('.')[0]
							
							if (Texture.all.length === 1) {
								for (let i = 0; i < models_count; i++) {
									textureFromCanvasRepeat(`${texture_name}${i}`, texture_width, texture_height, t.canvas,
										0, i * t.width, t.width, t.width, repeat_value_x, repeat_value_y, random_rotate)
								}
							}
							
							for (let i = 0; i < models_count; i++) {
								let mesh = new Mesh({
									name: `${texture_name}${i}`,
									vertices: {}
								})
								
								let r = 16 / 2
								mesh.addVertices([r, 0, r], [r, 0, -r], [-r, 0, r], [-r, 0, -r])
								let vertex_keys = Object.keys(mesh.vertices)
								mesh.addFaces(
									new MeshFace( mesh, {vertices: [vertex_keys[0], vertex_keys[1], vertex_keys[3], vertex_keys[2]]} )
								)
								
								mesh.init()
								mesh.select()
								UVEditor.setAutoSize(null, true, Object.keys(mesh.faces))
								
								Texture.all[i + 1].apply(true)
								
								let mesh_resize_width = texture_width / 16
								
								let mesh_x = Math.round((texture_width / (texture_height / 16)) * repeat_value_x)
								let mesh_z = 16 * repeat_value_y
								
								mesh_x = mesh_x % 2 === 0 ? mesh_x : mesh_x + 1
								
								resizeMesh(mesh, mesh_x, 0)
								resizeMesh(mesh, mesh_z, 2)
								
								let group = new Group({
									name: `${texture_name}${i}`
								})
								
								group.init()
								
								mesh.addTo(group)
								
								group.addTo(root)
							}
							
							if (Animation.all.length > 0) {
								for (let animation of Animation.all) {
									if (animation.name === 'default') {
										animation.remove()
										break
									}
								}
							}
							
							let animation_speed_value = 1 / animation_speed
							
							let animation = new Animation({
								name: 'default',
								loop: 'loop',
								length: root.children.length * animation_speed_value
							})
							
							animation.add()
							
							let bone_animators = []
							
							for (let group of root.children) {
								bone_animators.push(animation.getBoneAnimator(group))
							}
							
							for (let i = 0; i < bone_animators.length; i++) {
								for (let bone_animator of bone_animators) {
									let keyframe = bone_animator.addKeyframe({
										channel: 'rotation',
										data_points: [],
										time: i * animation_speed_value
									})
									
									if (bone_animator === bone_animators[i]) {
										keyframe.set('z', 0)
									} else {
										keyframe.set('z', -180)
									}
									
									keyframe = bone_animator.addKeyframe({
										channel: 'rotation',
										data_points: [],
										time: i * animation_speed_value + animation_speed_value - 0.00001
									})
									
									if (bone_animator === bone_animators[i]) {
										keyframe.set('z', 0)
									} else {
										keyframe.set('z', -180)
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
        }
	});

})();
