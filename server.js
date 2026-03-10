// ================= LAYOUT =================
function layout(titulo,conteudo,user){

let seletorTurmas="";

if(user){
seletorTurmas=`
<div style="margin-top:10px;">
<a href="/turma/1A"><button>1º Ano A</button></a>
<a href="/turma/2A"><button>2º Ano A</button></a>
<a href="/turma/3A"><button>3º Ano A</button></a>
</div>
`;
}

return `
<html>
<head>
<title>${titulo}</title>
<script src="/socket.io/socket.io.js"></script>

<style>

html,body{
margin:0;
padding:0;
height:100%;
font-family:Arial;
background:#f0f4f8;
}

/* HEADER */

header{
background:linear-gradient(90deg,#004080,#0073e6);
color:white;
padding:15px 30px;
}

.logout{
float:right;
color:white;
text-decoration:none;
}

.logoBtn{
color:white;
text-decoration:none;
font-weight:bold;
font-size:18px;
padding:6px 10px;
border-radius:8px;
display:inline-block;
}

.logoBtn:hover{
background:rgba(255,255,255,0.2);
}

/* ===== LAYOUT ===== */

.main{
display:flex;
min-height:calc(100vh - 60px);
}

/* ===== MENU LATERAL ===== */

.sidebar{
width:220px;
background:#0d3c6e;
color:white;
padding:10px;
flex-shrink:0;
}

.sidebar h3{
margin-top:0;
}

.menuBtn{
display:block;
background:#1c5fa8;
color:white;
text-decoration:none;
padding:10px;
margin:5px 0;
border-radius:8px;
}

.menuBtn:hover{
background:#2b7bdc;
}

/* ===== CONTEUDO ===== */

.content{
flex:1;
padding:20px;
}

.container{
max-width:900px;
margin:auto;
}

.card{
background:white;
padding:20px;
margin-bottom:20px;
border-radius:10px;
box-shadow:0 4px 10px rgba(0,0,0,0.08);
}

textarea{
width:100%;
height:80px;
}

button{
background:#0073e6;
color:white;
border:none;
padding:6px 12px;
border-radius:20px;
cursor:pointer;
margin:5px;
}

iframe{
margin-top:10px;
max-width:100%;
}

img{
margin-top:10px;
max-width:100%;
border-radius:8px;
}

/* CHAT */

.chatBtn{
position:fixed;
bottom:20px;
right:20px;
width:60px;
height:60px;
border-radius:50%;
font-size:24px;
}

.chatBox{
display:none;
flex-direction:column;
position:fixed;
bottom:90px;
right:20px;
width:340px;
height:450px;
background:white;
border-radius:10px;
box-shadow:0 0 15px rgba(0,0,0,0.2);
overflow:hidden;
}

.chatHeader{
background:#0073e6;
color:white;
padding:10px;
}

.chatMensagens{
flex:1;
overflow-y:auto;
padding:10px;
background:#f5f5f5;
}

.chatInput{
padding:10px;
border-top:1px solid #ddd;
display:flex;
gap:5px;
}

</style>
</head>

<body>

<header>

<a href="/" class="logoBtn">🎓 Portal Escolar</a>

${user?`<a class="logout" href="/logout">Sair</a>`:""}

${seletorTurmas}

</header>

<div class="main">

<div class="sidebar">

<h3>Menu</h3>

<a href="/boletim" class="menuBtn">📄 Boletim</a>
<a href="/horarios" class="menuBtn">⏰ Horários</a>
<a href="/eventos" class="menuBtn">📅 Eventos</a>
<a href="/recados" class="menuBtn">📢 Recados</a>

</div>

<div class="content">

<div class="container">

${conteudo}

</div>

</div>

</div>

</body>
</html>
`;
}
