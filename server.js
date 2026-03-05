// ================= IMPORTS =================
const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessionMiddleware = session({
secret:'segredo_escolar',
resave:false,
saveUninitialized:false
});

app.use(sessionMiddleware);

io.use((socket,next)=>{
sessionMiddleware(socket.request,{},next);
});

// ================= BANCO =================
const db=mysql.createConnection({
host:'localhost',
user:'escolar',
password:'1234',
database:'projeto_escolar'
});

db.connect(err=>{
if(err) console.log(err);
else console.log("Banco conectado com sucesso!");
});

// ================= UPLOAD =================
if(!fs.existsSync('uploads')) fs.mkdirSync('uploads');

const storage=multer.diskStorage({
destination:(req,file,cb)=>cb(null,'uploads/'),
filename:(req,file,cb)=>cb(null,Date.now()+path.extname(file.originalname))
});

const upload=multer({storage});
app.use('/uploads',express.static('uploads'));

// ================= LAYOUT =================
function layout(titulo,conteudo,user){

let seletorTurmas="";

if(user && user.tipo==="professor"){
seletorTurmas=`
<div style="margin-top:10px;">
<a href="/turma/1A"><button>1º Ano A</button></a>
<a href="/turma/2A"><button>2º Ano A</button></a>
<a href="/turma/3A"><button>3º Ano A</button></a>
</div>
`;
}

return`
<html>
<head>
<title>${titulo}</title>
<script src="/socket.io/socket.io.js"></script>

<style>

body{margin:0;font-family:Arial;background:#f0f4f8;}

header{
background:linear-gradient(90deg,#004080,#0073e6);
color:white;
padding:15px 30px;
}

.logout{float:right;color:white;text-decoration:none;}

.container{
max-width:900px;
margin:30px auto;
padding:20px;
}

.card{
background:white;
padding:20px;
margin-bottom:20px;
border-radius:10px;
box-shadow:0 4px 10px rgba(0,0,0,0.08);
}

textarea{width:100%;height:80px;}

img,video{max-width:100%;border-radius:10px;}

iframe{
width:100%;
height:400px;
border:none;
border-radius:10px;
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

/* CHAT */

.chat-float-btn{
position:fixed;
bottom:20px;
right:20px;
background:#0073e6;
color:white;
border:none;
padding:14px 16px;
border-radius:50px;
font-size:18px;
cursor:pointer;
}

.chat-window{
position:fixed;
bottom:80px;
right:20px;
width:340px;
height:460px;
background:white;
border-radius:10px;
display:none;
flex-direction:column;
overflow:hidden;
box-shadow:0 6px 20px rgba(0,0,0,0.2);
}

.chat-header{
background:#0073e6;
color:white;
padding:10px;
display:flex;
justify-content:space-between;
}

.chat-messages{
flex:1;
padding:10px;
overflow-y:auto;
background:#f5f6f7;
}

.chat-input{
display:flex;
flex-direction:column;
padding:6px;
border-top:1px solid #ddd;
}

.chat-row{
display:flex;
gap:5px;
}

.chat-row input{
flex:1;
}

.msg{
margin:6px 0;
padding:8px 12px;
border-radius:15px;
max-width:70%;
}

.preview{
max-width:150px;
margin-top:5px;
}

</style>

</head>

<body>

<header>
🎓 Portal Escolar
${user?`<a class="logout" href="/logout">Sair</a>`:""}
${seletorTurmas}
</header>

<div class="container">
${conteudo}
</div>

</body>
</html>
`;
}

// ================= PAGINA INICIAL =================
app.get('/',(req,res)=>{

res.send(layout("Inicio",`
<div class="card" style="text-align:center;">
<h2>Portal Escolar</h2>

<p>Escolha sua turma:</p>

<a href="/turma/1A"><button>1º Ano A</button></a>
<a href="/turma/2A"><button>2º Ano A</button></a>
<a href="/turma/3A"><button>3º Ano A</button></a>

<hr>

<a href="/login"><button>Login</button></a>
<a href="/registro"><button>Cadastro</button></a>

</div>
`,req.session.user));

});

// ================= REGISTRO =================
app.get('/registro',(req,res)=>{
res.send(layout("Cadastro",`
<div class="card">
<h2>Cadastro</h2>
<form method="POST">
<input name="nome" placeholder="Nome" required><br><br>
<input name="email" placeholder="Email" required><br><br>
<input type="password" name="senha" placeholder="Senha" required><br><br>

<select name="turma">
<option value="1A">1º Ano A</option>
<option value="2A">2º Ano A</option>
<option value="3A">3º Ano A</option>
</select><br><br>

<button>Cadastrar</button>
</form>
</div>
`));
});

app.post('/registro',async(req,res)=>{

const{nome,email,senha,turma}=req.body;

const hash=await bcrypt.hash(senha,10);

db.query(
"INSERT INTO users (nome,email,senha,turma,tipo) VALUES (?,?,?,?,?)",
[nome,email,hash,turma,"aluno"],
()=>res.redirect('/login')
);

});

// ================= LOGIN =================
app.get('/login',(req,res)=>{
res.send(layout("Login",`
<div class="card">
<h2>Login</h2>
<form method="POST">
<input name="email" placeholder="Email" required><br><br>
<input type="password" name="senha" placeholder="Senha" required><br><br>
<button>Entrar</button>
</form>
</div>
`));
});

app.post('/login',(req,res)=>{

const{email,senha}=req.body;

db.query("SELECT * FROM users WHERE email=?",[email],async(err,result)=>{

if(!result.length)return res.send("Usuário não encontrado");

const user=result[0];

const ok=await bcrypt.compare(senha,user.senha);

if(!ok)return res.send("Senha incorreta");

req.session.user=user;

res.redirect(`/turma/${user.turma}`);

});

});

// ================= POST =================
app.post('/post',upload.single('arquivo'),(req,res)=>{

const user=req.session.user;

const conteudo=req.body.conteudo;
const arquivo=req.file?req.file.filename:null;

db.query(
"INSERT INTO posts (user_id,turma,conteudo,arquivo,data_post) VALUES (?,?,?,?,NOW())",
[user.id,user.turma,conteudo,arquivo],
()=>res.redirect(`/turma/${user.turma}`)
);

});

// ================= FEED =================
app.get('/turma/:nome',(req,res)=>{

if(!req.session.user)return res.redirect('/login');

const turma=req.params.nome;
const user=req.session.user;

db.query(
"SELECT posts.*, users.nome FROM posts JOIN users ON posts.user_id=users.id WHERE posts.turma=? ORDER BY data_post DESC",
[turma],
(err,posts)=>{

if(err){
console.log("Erro SQL:",err);
posts=[];
}

if(!posts) posts=[];

let html=`
<div class="card">

<h2>Turma ${turma}</h2>

<form method="POST" action="/post" enctype="multipart/form-data">

<textarea name="conteudo" placeholder="Poste sua atividade..."></textarea>

<br><br>

<input type="file" name="arquivo">

<br><br>

<button>Postar</button>

</form>

</div>
`;

posts.forEach(post=>{

let midia="";

// YOUTUBE
if(post.conteudo && post.conteudo.includes("youtube.com")){
const id=post.conteudo.split("v=")[1]?.split("&")[0];
if(id){
midia+=`<iframe src="https://www.youtube.com/embed/${id}" allowfullscreen></iframe>`;
}
}

// ARQUIVO
if(post.arquivo){

const ext=post.arquivo.split('.').pop().toLowerCase();

if(["jpg","jpeg","png","gif","webp"].includes(ext))
midia+=`<img src="/uploads/${post.arquivo}">`;

else if(["mp4","webm","ogg"].includes(ext))
midia+=`<video controls src="/uploads/${post.arquivo}"></video>`;

else
midia+=`<a href="/uploads/${post.arquivo}">📎 Baixar arquivo</a>`;

}

html+=`
<div class="card">
<strong>${post.nome}</strong>
<p>${post.conteudo||""}</p>
${midia}
<small>${post.data_post}</small>
</div>
`;
});

html+=`

<button class="chat-float-btn" onclick="abrirChat()">💬</button>

<div id="chatWindow" class="chat-window">

<div class="chat-header">
Chat ${turma}
<button onclick="fecharChat()">✖</button>
</div>

<div id="chatMensagens" class="chat-messages"></div>

<div class="chat-input">

<div class="chat-row">
<input id="mensagem" placeholder="Mensagem">
<button onclick="enviar()">Enviar</button>
</div>

<div class="chat-row">
<input type="file" id="arquivo">
</div>

</div>

</div>

<script>

const socket=io();
socket.emit("entrarSala","${turma}");

const input=document.getElementById("mensagem");

input.addEventListener("keydown",function(e){
if(e.key==="Enter"){
e.preventDefault();
enviar();
}
});

function enviar(){

const texto=input.value.trim();
const fileInput=document.getElementById("arquivo");
const file=fileInput.files[0];

if(!texto && !file) return;

if(file){

const reader=new FileReader();

reader.onload=function(e){

socket.emit("mensagemArquivo",{
turma:"${turma}",
arquivo:e.target.result,
nome:file.name,
texto:texto
});

};

reader.readAsDataURL(file);

}else{

socket.emit("mensagem",{turma:"${turma}",texto});

}

input.value="";
fileInput.value="";
}

socket.on("novaMensagem",data=>{

const chat=document.getElementById("chatMensagens");
const div=document.createElement("div");

div.className="msg";

let conteudo="<strong>"+data.nome+":</strong> "+(data.texto||"");

if(data.arquivo){

if(data.arquivo.startsWith("data:image")){
conteudo+="<br><img class='preview' src='"+data.arquivo+"'>";
}
else if(data.arquivo.startsWith("data:video")){
conteudo+="<br><video class='preview' controls src='"+data.arquivo+"'></video>";
}
else{
conteudo+="<br><a download='"+data.nomeArquivo+"' href='"+data.arquivo+"'>📎 Baixar arquivo</a>";
}

}

div.innerHTML=conteudo;

chat.appendChild(div);
chat.scrollTop=chat.scrollHeight;

});

function abrirChat(){
document.getElementById("chatWindow").style.display="flex";
}

function fecharChat(){
document.getElementById("chatWindow").style.display="none";
}

</script>
`;

res.send(layout("Turma",html,user));

});

});

// ================= SOCKET =================
io.on("connection",socket=>{

const user=socket.request.session?.user;
if(!user)return;

socket.on("entrarSala",turma=>{
socket.join(turma);
});

socket.on("mensagem",data=>{
io.to(data.turma).emit("novaMensagem",{
nome:user.nome,
texto:data.texto
});
});

socket.on("mensagemArquivo",data=>{
io.to(data.turma).emit("novaMensagem",{
nome:user.nome,
texto:data.texto,
arquivo:data.arquivo,
nomeArquivo:data.nome
});
});

});

// ================= LOGOUT =================
app.get('/logout',(req,res)=>{
req.session.destroy();
res.redirect('/');
});

// ================= SERVIDOR =================
server.listen(3000,()=>{
console.log("Servidor rodando em http://localhost:3000");
});
