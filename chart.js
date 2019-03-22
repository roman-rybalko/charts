const chart_scroll_border_width_x = 20; // px
const chart_scroll_border_width_y = 5; // px
const chart_scroll_color_bg = "#f5f9fb";
const chart_scroll_color_fg = "#ddeaf3";

function chart_create(chart_id, container){
    container.innerHTML = "<canvas id='" + chart_id + "_chart' class='chart_canvas'></canvas>"
        + "<canvas id='" + chart_id + "_scroll' class='chart_scroll'></canvas>"
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

function chart_legend_create(chart_id, chart_data){
    const legend_div = document.getElementById(chart_id + "_legend");
    chart_column_foreach(chart_data, function(column_id){
        const column_name = chart_data.names[column_id];
        const column_color = chart_data.colors[column_id];
        legend_div.innerHTML += "<label class='chart_legend_checkbox' style='--main-bg-color:" + column_color + ";'>" + column_name
            + "<input type='checkbox' checked='checked'>"
            + "<span class='chart_legend_checkbox_customized'></span>"
            + "</label>";
    });
}

const chart_vs_src = `
    attribute highp float a_x;
    attribute highp float a_y;
    attribute lowp vec4 a_color;
    uniform mat4 u_proj;
    uniform mat4 u_view;
    uniform lowp int u_mode;
    uniform highp float u_scroll_border_x1;
    uniform highp float u_scroll_border_x3;
    uniform highp float u_scroll_border_x5;
    uniform highp float u_scroll_border_y3;
    uniform highp float u_scroll_border_width_x;
    uniform highp float u_scroll_border_width_y;
    varying lowp vec4 v_color;

    void mode_scroll(){
        float x = a_x;
        /* DEBUG
        if (x == -1.0){
            x = u_scroll_border_x1;
        } else if (x == -2.0){
            x = u_scroll_border_x1 + u_scroll_border_width_x;
        } else if (x == -3.0){
            x = u_scroll_border_x3;
        } else if (x == -4.0){
            x = u_scroll_border_x3 + u_scroll_border_width_x;
        } else if (x == -5.0){
            x = u_scroll_border_x5;
        }
        */
        float y = a_y;
        /* DEBUG
        if (y == -1.0){
            y = u_scroll_border_width_y;
        } else if (y == -2.0){
            y = u_scroll_border_y3 - u_scroll_border_width_y;
        } else if (x == -3.0){
            y = u_scroll_border_y3;
        }
        */
        gl_Position = vec4(x, y, 0.0, 1.0) * u_proj;
    }

    void mode_chart(){
        gl_Position = vec4(a_x, a_y, 0.0, 1.0) * u_proj * u_view;
    }

    void main(){
        if (u_mode == 1){
            mode_scroll();
        } else {
            mode_chart();
        }
        v_color = a_color;
    }
`;

const chart_fs_src = `
    varying lowp vec4 v_color;
    void main(){
        gl_FragColor = v_color;
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

function chart_max(arr, offset, accessor){
    if (!offset){
        offset = 0;
    }
    if (!accessor){
        accessor = function(x){return x;};
    }
    let max = null;
    for (const i in arr){
        if (--offset >= 0){
            continue;
        }
        if (max == null || max < accessor(arr[i])){
            max = accessor(arr[i]);
        }
    }
    return max;
}

function chart_chart_init(gl, program, chart_data){
    const chart_gl_data = {};

    chart_gl_data.count = chart_data.columns[0].length - 1;

    chart_gl_data.x_loc = gl.getAttribLocation(program, 'a_x');
    chart_gl_data.y_loc = gl.getAttribLocation(program, 'a_y');
    chart_gl_data.color_loc = gl.getAttribLocation(program, 'a_color');
    chart_gl_data.proj_loc = gl.getUniformLocation(program, 'u_proj');
    chart_gl_data.view_loc = gl.getUniformLocation(program, 'u_view');

    gl.enableVertexAttribArray(chart_gl_data.x_loc);
    gl.enableVertexAttribArray(chart_gl_data.y_loc);

    const x_data = new Float32Array(chart_gl_data.count);
    for (let i = 0; i < chart_gl_data.count; ++i){
        x_data[i] = i;
    }
    chart_gl_data.x_buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, chart_gl_data.x_buf);
    gl.bufferData(gl.ARRAY_BUFFER, x_data, gl.STATIC_DRAW);
    gl.vertexAttribPointer(chart_gl_data.x_loc, 1, gl.FLOAT, false, 0, 0);

    chart_gl_data.columns = {};
    chart_column_foreach(chart_data, function(column_id, column_data){
        const gl_column_data = chart_gl_data.columns[column_id] = {};
        gl_column_data.color = new Float32Array(chart_color_css2rgbaf(chart_data.colors[column_id], 1.0));
        gl_column_data.y_buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, gl_column_data.y_buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(column_data), gl.STATIC_DRAW);
        gl_column_data.y_max = chart_max(column_data, 1 /* start offset */);
    });
    chart_gl_data.y_max = chart_max(chart_gl_data.columns, 0, function(v){return v.y_max;});

    const identity_data = new Float32Array([
        1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0,
        0.0, 0.0, 0.0, 1.0
    ]);
    gl.uniformMatrix4fv(chart_gl_data.proj_loc, false, identity_data);
    gl.uniformMatrix4fv(chart_gl_data.view_loc, false, identity_data);

    gl.clearColor(0.0, 0.0, 0.0, 0.0);

    return chart_gl_data;
}

function chart_scroll_init(gl, program, chart_gl_data){
    const scroll_gl_data = {};

    scroll_gl_data.mode_loc = gl.getUniformLocation(program, 'u_mode');
    scroll_gl_data.x1_loc = gl.getUniformLocation(program, 'u_scroll_border_x1');
    scroll_gl_data.x3_loc = gl.getUniformLocation(program, 'u_scroll_border_x3');
    scroll_gl_data.x5_loc = gl.getUniformLocation(program, 'u_scroll_border_x5');
    scroll_gl_data.y3_loc = gl.getUniformLocation(program, 'u_scroll_border_y3');
    const width_x_loc = gl.getUniformLocation(program, 'u_scroll_border_width_x');
    const width_y_loc = gl.getUniformLocation(program, 'u_scroll_border_width_y');

    /*
     *  4-------------------------3 8---7------3------16-15 20--------------19
     *  |                         | |   | 12---2---11 |   | |                |
     *  |                         1 1   2 2         3 3   4 4                5
     *  |                         | |   | 9----1---10 |   | |                |
     *  1-------------------------2 5---6-------------13-14 17--------------18
     */

    const x_data = new Float32Array([
         0, // dummy, to start indexes at 1, not 0, for convenience
         0, -1, -1,  0, -1, -2, -2, -1, -2, -3,
        -3, -2, -3, -4, -4, -3, -4, -5, -5, -4
    ]);
    const y_data = new Float32Array([
         0, // dummy
         0,  0, -3, -3,  0,  0, -3, -3, -1, -1,
        -2, -2,  0,  0, -3, -3,  0,  0, -3, -3
    ]);

    const color_data = new Float32Array(x_data.length * 4);
    const color_bg = chart_color_css2rgbaf(chart_scroll_color_bg, 1.0)
    for (const i in [1, 2, 3, 4, 17, 18, 19, 20]){
        color_data.set(color_bg, i*4);
    }
    const color_fg = chart_color_css2rgbaf(chart_scroll_color_fg, 1.0)
    for (let i = 5; i <= 16; ++i){
        color_data.set(color_fg, i*4);
    }

    // indexes for gl.TRIANGLES drawing mode
    const index_data = new Uint8Array([
        1, 2, 4,  4, 2, 3,
        5, 6, 8,  8, 6, 7,  6, 9, 13,  13, 10, 9,  13, 16, 10,  16, 10, 11,  16, 12, 11,  16, 12, 7,
        17, 18, 20,  20, 18, 19
    ]);

    scroll_gl_data.count = index_data.length;

    scroll_gl_data.x_buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, scroll_gl_data.x_buf);
    gl.bufferData(gl.ARRAY_BUFFER, x_data, gl.STATIC_DRAW);

    scroll_gl_data.y_buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, scroll_gl_data.y_buf);
    gl.bufferData(gl.ARRAY_BUFFER, y_data, gl.STATIC_DRAW);

    const color_buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, color_buf);
    gl.bufferData(gl.ARRAY_BUFFER, color_data, gl.STATIC_DRAW);
    gl.vertexAttribPointer(chart_gl_data.color_loc, 4, gl.FLOAT, false, 0, 0);

    const index_buf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index_buf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index_data, gl.STATIC_DRAW);

    gl.uniform1f(width_x_loc, chart_scroll_border_width_x);
    gl.uniform1f(width_y_loc, chart_scroll_border_width_y);

    return scroll_gl_data;
}

function chart_chart_draw(gl, chart_gl_data){
    gl.uniformMatrix4fv(chart_gl_data.proj_loc, false, new Float32Array(chart_proj_ortho(0, chart_gl_data.count, 0, chart_gl_data.y_max)));
    for (const i in chart_gl_data.columns){
        gl.bindBuffer(gl.ARRAY_BUFFER, chart_gl_data.columns[i].y_buf);
        gl.vertexAttribPointer(chart_gl_data.y_loc, 1, gl.FLOAT, false, 0, 4 /* skip the 1st element */);
        gl.vertexAttrib4fv(chart_gl_data.color_loc, chart_gl_data.columns[i].color);
        gl.drawArrays(gl.LINE_STRIP, 0, chart_gl_data.count);
    }
}

function chart_scroll_draw(gl, chart_gl_data, scroll_gl_data){
    gl.bindBuffer(gl.ARRAY_BUFFER, scroll_gl_data.x_buf);
    gl.vertexAttribPointer(chart_gl_data.x_loc, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, scroll_gl_data.y_buf);
    gl.vertexAttribPointer(chart_gl_data.y_loc, 1, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(chart_gl_data.color_loc);
    //gl.uniformMatrix4fv(chart_gl_data.proj_loc, false, new Float32Array(chart_proj_ortho(0, 100, 0, 1000)));
    gl.uniformMatrix4fv(chart_gl_data.proj_loc, false, new Float32Array(chart_proj_ortho(0, -5, 0, -3))); // DEBUG
    gl.uniform1f(scroll_gl_data.x1_loc, 600); // DEBUG
    gl.uniform1f(scroll_gl_data.x3_loc, 800); // DEBUG
    gl.uniform1f(scroll_gl_data.x5_loc, 1000); // DEBUG
    gl.uniform1f(scroll_gl_data.y3_loc, 100); // DEBUG
    gl.uniform1i(scroll_gl_data.mode_loc, 1);

    gl.drawElements(gl.TRIANGLES, scroll_gl_data.count, gl.UNSIGNED_BYTE, 0);

    // restore gl state for chart_chart_draw()
    gl.bindBuffer(gl.ARRAY_BUFFER, chart_gl_data.x_buf);
    gl.vertexAttribPointer(chart_gl_data.x_loc, 1, gl.FLOAT, false, 0, 0);
    gl.disableVertexAttribArray(chart_gl_data.color_loc);
    gl.uniform1i(scroll_gl_data.mode_loc, 0);
}

function chart_chart_create(chart_id, chart_data){
    const chart_canvas = document.getElementById(chart_id + "_chart");
    const chart_gl = chart_canvas.getContext("webgl");
    const program = chart_program_init(chart_gl);
    chart_gl.useProgram(program);
    const chart_gl_data = chart_chart_init(chart_gl, program, chart_data);

    function onresize(){
        chart_canvas.width = chart_canvas.clientWidth;
        chart_canvas.height = chart_canvas.clientHeight;
        chart_gl.viewport(0, 0, chart_canvas.width, chart_canvas.height);
        chart_gl.clear(chart_gl.COLOR_BUFFER_BIT);
        chart_chart_draw(chart_gl, chart_gl_data);
    }
    onresize();
    window.addEventListener("resize", onresize);
}

function chart_scroll_create(chart_id, chart_data){
    const scroll_canvas = document.getElementById(chart_id + "_scroll");
    const scroll_gl = scroll_canvas.getContext("webgl");
    const program = chart_program_init(scroll_gl);
    scroll_gl.useProgram(program);
    const chart_gl_data = chart_chart_init(scroll_gl, program, chart_data);
    const scroll_gl_data = chart_scroll_init(scroll_gl, program, chart_gl_data);

    function onresize(){
        scroll_canvas.width = scroll_canvas.clientWidth;
        scroll_canvas.height = scroll_canvas.clientHeight;
        scroll_gl.viewport(0, 0, scroll_canvas.width, scroll_canvas.height);
        scroll_gl.clear(scroll_gl.COLOR_BUFFER_BIT);
        chart_scroll_draw(scroll_gl, chart_gl_data, scroll_gl_data);
        chart_chart_draw(scroll_gl, chart_gl_data);
    }
    onresize();
    window.addEventListener("resize", onresize);

    // DEBUG
    function draw(){
        scroll_gl.clear(scroll_gl.COLOR_BUFFER_BIT);
        chart_scroll_draw(scroll_gl, chart_gl_data, scroll_gl_data);
        chart_chart_draw(scroll_gl, chart_gl_data);
        window.requestAnimationFrame(draw);
    };
    window.requestAnimationFrame(draw);
}

function chart(div_id, chart_data){
    const container = document.getElementById(div_id);
    chart_create(div_id, container);
    const chart_state = {};
    chart_legend_create(div_id, chart_data, chart_state);
    chart_chart_create(div_id, chart_data, chart_state);
    chart_scroll_create(div_id, chart_data, chart_state);
    console.log(chart_data); // DEBUG
    console.log(container); // DEBUG
}
