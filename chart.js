const chart_scroll_width = 10; // px
const chart_scroll_height = 2; // px
const chart_scroll_color_bg = "#f5f9fb";
const chart_scroll_color_fg = "#ddeaf3";
const chart_chart_color_bg = "#dfe6eb";
const chart_chart_color_fg = "#96a2aa";

function chart_create(chart_id, container){
    container.innerHTML = "<div class='chart_chart_wrap'>"
        + "<canvas id='" + chart_id + "_chart1' class='chart_chart'></canvas>"
        + "<canvas id='" + chart_id + "_chart2' class='chart_chart' style='z-index:-1;'></canvas>"
        + "</div>"
        + "<div class='chart_scroll_wrap'>"
        + "<canvas id='" + chart_id + "_scroll1' class='chart_scroll' style='z-index:-1;'></canvas>"
        + "<canvas id='" + chart_id + "_scroll2' class='chart_scroll'></canvas>"
        + "</div>"
        + "<div id='" + chart_id + "_legend' class='chart_legend'></div>";
}

function chart_column_foreach(chart_data, callback){
    for (const i in chart_data.columns){
        const column_id = chart_data.columns[i][0];
        if (chart_data.types[column_id] == "x"){
            continue;
        }
        callback(column_id, chart_data.columns[i]);
    }
}

function chart_legend_create(chart_id, chart_data, chart_state){
    const legend_div = document.getElementById(chart_id + "_legend");
    chart_state.columns_enabled = {};

    chart_column_foreach(chart_data, function(column_id){
        const column_name = chart_data.names[column_id];
        const column_color = chart_data.colors[column_id];
        legend_div.innerHTML += "<label class='chart_legend_checkbox' style='--main-bg-color:" + column_color + ";'>" + column_name
            + "<input type='checkbox' checked='checked' id='" + chart_id + "_legend_column_" + column_id + "'>"
            + "<span class='chart_legend_checkbox_customized'></span>"
            + "</label>";
    });

    chart_column_foreach(chart_data, function(column_id){
        const column_control = document.getElementById(chart_id + "_legend_column_" + column_id);
        chart_state.columns_enabled[column_id] = true;
        column_control.addEventListener("change", function(){
            chart_state.columns_enabled[column_id] = !chart_state.columns_enabled[column_id];
            chart_state.compute();
            chart_state.scroll_draw();
            chart_state.chart_draw();
        });
    });
}

const chart_vs_src = `
    attribute highp float a_x;
    attribute highp float a_y;
    uniform mat4 u_proj;
    uniform mat4 u_view;
    void main(void){
        gl_Position = vec4(a_x, a_y, 0.0, 1.0) * u_proj * u_view;
    }
`;

const chart_fs_src = `
    uniform lowp vec4 u_color;
    void main(void){
        gl_FragColor = u_color;
    }
`;

function chart_shader_init(gl, type, src){
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
        throw gl.getShaderInfoLog(shader);
    }
    return shader;
}

function chart_program_init(gl){
    const vs = chart_shader_init(gl, gl.VERTEX_SHADER, chart_vs_src);
    const fs = chart_shader_init(gl, gl.FRAGMENT_SHADER, chart_fs_src);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)){
        throw gl.getProgramInfoLog(program);
    }
    return program;
}

function chart_color_css2rgbaf(css_color, alpha){
    return [
        parseInt(css_color.slice(1,3), 16) * 1.0 / 255,
        parseInt(css_color.slice(3,5), 16) * 1.0 / 255,
        parseInt(css_color.slice(5,7), 16) * 1.0 / 255,
        alpha
    ];
}

function chart_proj_ortho(left, right, bottom, top){
    return [
        2.0/(right-left), 0.0, 0.0, -(right+left)/(right-left),
        0.0, 2.0/(top-bottom), 0.0, -(top+bottom)/(top-bottom),
        0.0, 0.0, 1.0, 0.0,
        0.0, 0.0, 0.0, 1.0
    ];
}

function chart_view_persp(left, right, zoom_left, zoom_right){
    return chart_proj_ortho(-1.0+2.0*zoom_left/(right-left), -1.0+2.0*zoom_right/(right-left), -1.0, 1.0);
}

function chart_gl_init(gl, chart_data){
    const gl_state = {};

    gl_state.count = chart_data.columns[0].length - 1;

    const program = chart_program_init(gl);
    gl.useProgram(program);

    const x_loc = gl.getAttribLocation(program, 'a_x');
    gl_state.y_loc = gl.getAttribLocation(program, 'a_y');
    gl_state.proj_loc = gl.getUniformLocation(program, 'u_proj');
    gl_state.view_loc = gl.getUniformLocation(program, 'u_view');
    gl_state.color_loc = gl.getUniformLocation(program, 'u_color');

    gl.enableVertexAttribArray(x_loc);
    gl.enableVertexAttribArray(gl_state.y_loc);

    const x_data = new Float32Array(gl_state.count);
    for (let i = 0; i < gl_state.count; ++i){
        x_data[i] = i;
    }
    const x_buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, x_buf);
    gl.bufferData(gl.ARRAY_BUFFER, x_data, gl.STATIC_DRAW);
    gl.vertexAttribPointer(x_loc, 1, gl.FLOAT, false, 0, 0);

    gl_state.columns = {};
    chart_column_foreach(chart_data, function(column_id, column_data){
        const gl_column_data = gl_state.columns[column_id] = {};
        gl_column_data.color = new Float32Array(chart_color_css2rgbaf(chart_data.colors[column_id], 1.0));
        gl_column_data.y_buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, gl_column_data.y_buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(column_data), gl.STATIC_DRAW);
    });

    const identity_data = new Float32Array([
        1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0,
        0.0, 0.0, 0.0, 1.0
    ]);
    gl.uniformMatrix4fv(gl_state.proj_loc, false, identity_data);
    gl.uniformMatrix4fv(gl_state.view_loc, false, identity_data);

    gl.clearColor(0.0, 0.0, 0.0, 0.0);

    return gl_state;
}

function chart_gl_draw(gl, gl_state, chart_state, no_scale){
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (no_scale){
        gl.uniformMatrix4fv(gl_state.proj_loc, false, new Float32Array(chart_proj_ortho(0, gl_state.count, chart_state.enabled_minmax.min, chart_state.enabled_minmax.max)));
    } else {
        gl.uniformMatrix4fv(gl_state.proj_loc, false, new Float32Array(chart_proj_ortho(0, gl_state.count, chart_state.scaled_minmax.min, chart_state.scaled_minmax.max)));
        gl.uniformMatrix4fv(gl_state.view_loc, false, new Float32Array(chart_view_persp(0, 1, chart_state.scroll_left, chart_state.scroll_right)));
    }
    for (const i in gl_state.columns){
        if (!chart_state.columns_enabled[i]){
            continue;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, gl_state.columns[i].y_buf);
        gl.vertexAttribPointer(gl_state.y_loc, 1, gl.FLOAT, false, 0, 4 /* skip the 1st element */);
        gl.uniform4fv(gl_state.color_loc, gl_state.columns[i].color);
        gl.drawArrays(gl.LINE_STRIP, 0, gl_state.count);
    }
}

function chart_chart_2d_init(ctx2d, chart_state){
    chart_state.chart = {
        cursor: 0
    };
}

function chart_chart_2d_draw(ctx2d, chart_data, chart_state){
    const h = ctx2d.canvas.height;
    const w = ctx2d.canvas.width;
    ctx2d.clearRect(0, 0, w, h);

    function step_magic(min, max, lines_cnt){
        let value1 = (max - min) / lines_cnt;
        const mult = lines_cnt;
        let step = mult;
        while (step < value1){
            step *= mult;
        }
        step /= mult;
        value1 = Math.round(value1 / step) * step;
        return {step: step, value1: value1};
    }

    const min = chart_state.scaled_minmax.min;
    const max = chart_state.scaled_minmax.max;
    const step_data = step_magic(min, max, 5 /* lines cnt */);
    const h1 = Math.round(1.0 * (step_data.value1 - min) / (max - min) * h);
    const h_step = Math.round(1.0 * step_data.value1 / (max - min) * h);

    ctx2d.strokeStyle = chart_chart_color_bg;
    ctx2d.beginPath();
    ctx2d.moveTo(0, h);
    ctx2d.lineTo(w, h);
    for (let y = h1; y < h; y += h_step){
        ctx2d.moveTo(0, h-y);
        ctx2d.lineTo(w, h-y);
    }
    ctx2d.stroke();

    ctx2d.fillStyle = chart_chart_color_fg;
    ctx2d.fillText(min, 0, h);
    for (let value = step_data.value1, y = h1; value < max; value += step_data.step, y += h_step){
        ctx2d.fillText(value, 0, h-y);
    }

    function time_data(chart_data){
        for (const i in chart_data.columns){
            const column_id = chart_data.columns[i][0];
            if (chart_data.types[column_id] == "x"){
                return chart_data.columns[i];
            }
        }
        return null;
    }

    const t_line = time_data(chart_data);
    // skip the 1st
    const t_count = t_line.length - 1;
    const t_begin = Math.floor(t_count * chart_state.scroll_left) + 1;
    const t_end = Math.ceil(t_count * chart_state.scroll_right) + 1;
    ctx2d.fillStyle = chart_chart_color_fg;
    for (let i = t_begin, t_w = 0; i < t_end; ++i){
        const x = Math.round(1.0 * (i - t_begin) / (t_end - t_begin) * w);
        if (x < t_w){
            continue;
        }
        ctx2d.fillText(new Date(t_line[i]).toString(), x, h);
        t_w += ctx2d.measureText(new Date(t_line[i]).toString()).width * 1.5;
    }

    ctx2d.strokeStyle = chart_chart_color_bg;
    ctx2d.beginPath();
    ctx2d.moveTo(chart_state.chart.cursor, 0);
    ctx2d.lineTo(chart_state.chart.cursor, h);
    ctx2d.stroke();
}

function chart_chart_create(chart_id, chart_data, chart_state){
    const chart_canvas_2d = document.getElementById(chart_id + "_chart1");
    const chart_2d = chart_canvas_2d.getContext("2d");
    chart_chart_2d_init(chart_2d, chart_state);

    const chart_canvas_gl = document.getElementById(chart_id + "_chart2");
    const chart_gl = chart_canvas_gl.getContext("webgl");
    const chart_gl_state = chart_gl_init(chart_gl, chart_data);

    chart_state.chart_draw = function(){
        chart_chart_2d_draw(chart_2d, chart_data, chart_state);
        chart_gl_draw(chart_gl, chart_gl_state, chart_state);
    }

    function onresize(){
        chart_canvas_2d.width = chart_canvas_2d.clientWidth;
        chart_canvas_2d.height = chart_canvas_2d.clientHeight;

        chart_canvas_gl.width = chart_canvas_gl.clientWidth;
        chart_canvas_gl.height = chart_canvas_gl.clientHeight;
        chart_gl.viewport(0, 0, chart_canvas_gl.width, chart_canvas_gl.height);

        chart_state.chart_draw();
    }
    onresize();
    window.addEventListener("resize", onresize);

    function cursor_update(e){
        const x = e.clientX - chart_canvas_2d.getBoundingClientRect().left - window.scrollX;
        chart_state.chart.cursor = x;
        chart_chart_2d_draw(chart_2d, chart_data, chart_state);
    }
    chart_canvas_2d.addEventListener("mousemove", cursor_update);
}

function chart_scroll_2d_init(ctx2d, chart_state){
    chart_state.scroll = {
        left: chart_state.scroll_left * ctx2d.canvas.width,
        right: chart_state.scroll_right * ctx2d.canvas.width,
        scaling_left: false,
        scaling_right: false,
        moving: false
    };
}

function chart_scroll_2d_draw(ctx2d, state){
    const h = ctx2d.canvas.height;
    ctx2d.clearRect(0, 0, ctx2d.canvas.width, h);
    ctx2d.fillStyle = chart_scroll_color_bg;
    ctx2d.fillRect(0, h, state.scroll.left, -h);
    ctx2d.fillRect(state.scroll.right, h, ctx2d.canvas.width, -h);
    ctx2d.fillStyle = chart_scroll_color_fg;
    ctx2d.fillRect(state.scroll.left, h, chart_scroll_width, -h);
    ctx2d.fillRect(state.scroll.left + chart_scroll_width, h, state.scroll.right - state.scroll.left - chart_scroll_width, -chart_scroll_height);
    ctx2d.fillRect(state.scroll.left + chart_scroll_width, chart_scroll_height, state.scroll.right - state.scroll.left - chart_scroll_width, -chart_scroll_height);
    ctx2d.fillRect(state.scroll.right - chart_scroll_width, h, chart_scroll_width, -h);
}

function chart_scroll_create(chart_id, chart_data, chart_state){
    const scroll_canvas_2d = document.getElementById(chart_id + "_scroll1");
    const scroll_2d = scroll_canvas_2d.getContext("2d");
    chart_scroll_2d_init(scroll_2d, chart_state);

    const scroll_canvas_gl = document.getElementById(chart_id + "_scroll2");
    const scroll_gl = scroll_canvas_gl.getContext("webgl");
    const scroll_gl_state = chart_gl_init(scroll_gl, chart_data);

    chart_state.scroll_draw = function(){
        chart_gl_draw(scroll_gl, scroll_gl_state, chart_state, "no scale");
    };

    function onresize(){
        scroll_canvas_2d.width = scroll_canvas_2d.clientWidth;
        scroll_canvas_2d.height = scroll_canvas_2d.clientHeight;
        if (chart_state.scroll.right > scroll_canvas_2d.width){
            chart_state.scroll.right = scroll_canvas_2d.width;
        }
        chart_state.scroll_right = chart_state.scroll.right * 1.0 / scroll_canvas_2d.width;

        scroll_canvas_gl.width = scroll_canvas_gl.clientWidth;
        scroll_canvas_gl.height = scroll_canvas_gl.clientHeight;
        scroll_gl.viewport(0, 0, scroll_canvas_gl.width, scroll_canvas_gl.height);

        chart_scroll_2d_draw(scroll_2d, chart_state);
        chart_state.scroll_draw();
    }
    onresize();
    window.addEventListener("resize", onresize);

    function normalize(x, min, max){
        if (x < min){
            return min;
        }
        if (x > max){
            return max;
        }
        return x;
    }

    function change(e){
        const x = e.clientX - scroll_canvas_2d.getBoundingClientRect().left - window.scrollX;
        const move = x - chart_state.scroll.last_x;
        let changed = false;
        if (chart_state.scroll.scaling_left){
            const new_left = normalize(chart_state.scroll.left + move, 0, chart_state.scroll.right - chart_scroll_width*2);
            if (chart_state.scroll.left != new_left){
                chart_state.scroll.left = new_left;
                chart_state.scroll_left = chart_state.scroll.left * 1.0 / scroll_canvas_2d.width;
                changed = true;
            }
        } else if (chart_state.scroll.moving){
            const rl = chart_state.scroll.right - chart_state.scroll.left;
            const new_left = normalize(chart_state.scroll.left + move, 0, scroll_canvas_2d.width - rl);
            const new_right = normalize(chart_state.scroll.right + move, rl, scroll_canvas_2d.width);
            if (chart_state.scroll.left != new_left){
                chart_state.scroll.left = new_left;
                chart_state.scroll_left = chart_state.scroll.left * 1.0 / scroll_canvas_2d.width;
                chart_state.scroll.right = new_right;
                chart_state.scroll_right = chart_state.scroll.right * 1.0 / scroll_canvas_2d.width;
                changed = true;
            }
        } else if (chart_state.scroll.scaling_right){
            const new_right = normalize(chart_state.scroll.right + move, chart_state.scroll.left + chart_scroll_width*2, scroll_canvas_2d.width);
            if (chart_state.scroll.right != new_right){
                chart_state.scroll.right = new_right;
                chart_state.scroll_right = chart_state.scroll.right * 1.0 / scroll_canvas_2d.width;
                changed = true;
            }
        }
        if (changed){
            chart_state.scroll.last_x = x;
            chart_state.compute();
            chart_scroll_2d_draw(scroll_2d, chart_state);
            chart_state.chart_draw();
        }
    }

    function stop_change(){
        chart_state.scroll.scaling_left = false;
        chart_state.scroll.moving = false;
        chart_state.scroll.scaling_right = false;
        window.removeEventListener("mousemove", change);
        window.removeEventListener("mouseup", stop_change);
    }

    function start_change(e){
        const x = e.clientX - scroll_canvas_2d.getBoundingClientRect().left - window.scrollX;
        // increasing borders to border width x 3 for convenience
        if (x >= chart_state.scroll.left - chart_scroll_width && x <= chart_state.scroll.left + chart_scroll_width*2){
            chart_state.scroll.scaling_left = true;
        } else if (x > chart_state.scroll.left + chart_scroll_width*2 && x < chart_state.scroll.right - chart_scroll_width*2){
            chart_state.scroll.moving = true;
        } else if (x >= chart_state.scroll.right - chart_scroll_width*2 && x <= chart_state.scroll.right + chart_scroll_width){
            chart_state.scroll.scaling_right = true;
        }
        if (chart_state.scroll.scaling_left || chart_state.scroll.moving || chart_state.scroll.scaling_right){
            chart_state.scroll.last_x = x;
            window.addEventListener("mousemove", change);
            window.addEventListener("mouseup", stop_change);
        }
    }
    scroll_canvas_gl.addEventListener("mousedown", start_change);
}

function chart_data_minmax(chart_data, chart_state, no_scale){
    // skip the 1st
    const count = chart_data.columns[0].length - 1;
    const begin = no_scale ? 1 : Math.floor(count * chart_state.scroll_left) + 1;
    const end = no_scale ? count + 1 : Math.ceil(count * chart_state.scroll_right) + 1;
    let min = null;
    let max = null;
    chart_column_foreach(chart_data, function(column_id, column_data){
        if (!chart_state.columns_enabled[column_id]){
            return;
        }
        for (let i = begin; i < end; ++i){
            if (min == null || min > column_data[i]){
                min = column_data[i];
            }
            if (max == null || max < column_data[i]){
                max = column_data[i];
            }
        }
    });
    return {min: min, max: max};
}

function chart(div_id, chart_data){
    const container = document.getElementById(div_id);
    chart_create(div_id, container);
    const chart_state = {scroll_left: 0, scroll_right: 1};
    chart_state.compute = function(){
        chart_state.scaled_minmax = chart_data_minmax(chart_data, chart_state);
        chart_state.enabled_minmax = chart_data_minmax(chart_data, chart_state, "no scale");
    };
    chart_legend_create(div_id, chart_data, chart_state);
    chart_state.enabled_minmax = chart_data_minmax(chart_data, chart_state, "no scale");
    chart_scroll_create(div_id, chart_data, chart_state);
    chart_state.scaled_minmax = chart_data_minmax(chart_data, chart_state);
    chart_chart_create(div_id, chart_data, chart_state);
}
