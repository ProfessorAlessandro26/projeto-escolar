const express = require("express");
const mysql = require("mysql2");
const session = require("express-session");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ===== HANDLERS DE ERRO GLOBAIS =====
process.on('uncaughtException', (err) => {
    console.log('❌ ERRO NÃO CAPTURADO:');
    console.log('Nome:', err.name);
    console.log('Mensagem:', err.message);
    console.log('Stack:', err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.log('❌ PROMESSA REJEITADA NÃO TRATADA:');
    console.log('Razão:', reason);
});

// Aumentar limite de tamanho de arquivo para 50MB
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Criar pasta uploads se não existir
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
    fs.chmodSync('uploads', 0o777);
}

// Criar pasta fotos_perfil se não existir
if (!fs.existsSync('fotos_perfil')) {
    fs.mkdirSync('fotos_perfil');
    fs.chmodSync('fotos_perfil', 0o777);
}

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === 'foto') {
            cb(null, 'fotos_perfil/');
        } else {
            cb(null, 'uploads/');
        }
    },
    filename: (req, file, cb) => {
        const cleanName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        cb(null, Date.now() + '-' + cleanName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB
    },
    fileFilter: (req, file, cb) => {
        console.log("Arquivo recebido:", file.originalname, "Tipo:", file.mimetype);
        
        if (file.fieldname === 'foto') {
            if (file.mimetype.startsWith('image/')) {
                cb(null, true);
            } else {
                cb(new Error('Apenas imagens são permitidas para foto de perfil'), false);
            }
        } else {
            if (file.mimetype === 'application/pdf' || 
                file.mimetype.startsWith('image/') || 
                file.mimetype.startsWith('video/')) {
                cb(null, true);
            } else {
                console.log("Tipo de arquivo não permitido:", file.mimetype);
                cb(new Error('Tipo de arquivo não permitido'), false);
            }
        }
    }
});

app.use('/uploads', express.static('uploads'));
app.use('/fotos_perfil', express.static('fotos_perfil'));

app.use(session({
    secret: "escola",
    resave: false,
    saveUninitialized: true
}));

// ===== BANCO =====
// CORREÇÃO: Mudei de "localhost" para "127.0.0.1" para evitar problema de IPv6
const db = mysql.createConnection({
    host: "127.0.0.1",     // ← CORREÇÃO AQUI: use 127.0.0.1 em vez de localhost
    port: 3306,             // ← ADICIONADO: porta explícita
    user: "escola",
    password: "1234",
    database: "escola"
});

db.connect(err => {
    if (err) {
        console.log("Erro banco", err);
    } else {
        console.log("✅ Banco conectado com sucesso!");
    }
});

// Criar tabelas necessárias
db.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user VARCHAR(50) UNIQUE NOT NULL,
        pass VARCHAR(100) NOT NULL,
        cargo VARCHAR(50),
        turma VARCHAR(10),
        email VARCHAR(100),
        telefone VARCHAR(20),
        endereco TEXT,
        nome_pai VARCHAR(100),
        nome_mae VARCHAR(100),
        foto VARCHAR(255),
        reset_token VARCHAR(100),
        reset_expira DATETIME,
        online BOOLEAN DEFAULT FALSE,
        ultima_vez DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`);

db.query(`
    CREATE TABLE IF NOT EXISTS posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user VARCHAR(50) NOT NULL,
        turma VARCHAR(10) NOT NULL,
        conteudo TEXT,
        tipo VARCHAR(20) DEFAULT 'texto',
        arquivo VARCHAR(255),
        youtube_url VARCHAR(255),
        likes INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`);

db.query(`
    CREATE TABLE IF NOT EXISTS boletins_posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user VARCHAR(50) NOT NULL,
        turma VARCHAR(10) NOT NULL,
        conteudo TEXT,
        tipo VARCHAR(20) DEFAULT 'texto',
        arquivo VARCHAR(255),
        likes INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`);

// ===== TABELA PARA RECADOS =====
db.query(`
    CREATE TABLE IF NOT EXISTS recados_posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user VARCHAR(50) NOT NULL,
        titulo VARCHAR(200),
        conteudo TEXT,
        tipo VARCHAR(20) DEFAULT 'texto',
        arquivo VARCHAR(255),
        youtube_url VARCHAR(255),
        likes INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`);

// ===== TABELA PARA CARDÁPIO SEMANAL (COM TURNO) =====
db.query(`
    CREATE TABLE IF NOT EXISTS cardapio_posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user VARCHAR(50) NOT NULL,
        titulo VARCHAR(200),
        conteudo TEXT,
        tipo VARCHAR(20) DEFAULT 'texto',
        arquivo VARCHAR(255),
        youtube_url VARCHAR(255),
        likes INT DEFAULT 0,
        turno ENUM('matutino', 'vespertino', 'noturno') DEFAULT 'matutino',
        data_semana DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`);

// ===== TABELA PARA POSTS DA LIMPEZA =====
db.query(`
    CREATE TABLE IF NOT EXISTS limpeza_posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user VARCHAR(50) NOT NULL,
        titulo VARCHAR(200),
        conteudo TEXT,
        tipo VARCHAR(20) DEFAULT 'texto',
        arquivo VARCHAR(255),
        youtube_url VARCHAR(255),
        likes INT DEFAULT 0,
        setor VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`);

// ===== TABELA PARA POSTS DO PÁTIO/MANUTENÇÃO =====
db.query(`
    CREATE TABLE IF NOT EXISTS patio_posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user VARCHAR(50) NOT NULL,
        titulo VARCHAR(200),
        conteudo TEXT,
        tipo VARCHAR(20) DEFAULT 'texto',
        arquivo VARCHAR(255),
        youtube_url VARCHAR(255),
        likes INT DEFAULT 0,
        area VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`);

// ===== TABELA PARA EVENTOS E COMUNICADOS =====
db.query(`
    CREATE TABLE IF NOT EXISTS eventos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user VARCHAR(50) NOT NULL,
        titulo VARCHAR(200) NOT NULL,
        descricao TEXT,
        data_evento DATE NOT NULL,
        tipo ENUM('evento', 'feriado', 'comunicado') DEFAULT 'evento',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`);

db.query(`
    CREATE TABLE IF NOT EXISTS comunicados (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user VARCHAR(50) NOT NULL,
        titulo VARCHAR(200) NOT NULL,
        conteudo TEXT NOT NULL,
        importante BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`);

db.query(`
    CREATE TABLE IF NOT EXISTS comentarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        user VARCHAR(50) NOT NULL,
        comentario TEXT NOT NULL,
        likes INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    )
`);

// ===== RECRIAR TABELA LIKES COM A ESTRUTURA CORRETA =====
db.query("DROP TABLE IF EXISTS likes_temp", (err) => {
    if (err) console.log("Erro ao dropar tabela temporária:", err);
});

// Criar a tabela likes com a estrutura correta
db.query(`
    CREATE TABLE IF NOT EXISTS likes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user VARCHAR(50) NOT NULL,
        post_id INT,
        boletim_id INT,
        recado_id INT,
        cardapio_id INT,
        limpeza_id INT,
        patio_id INT,
        comentario_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_like (user, post_id, boletim_id, recado_id, cardapio_id, limpeza_id, patio_id, comentario_id)
    )
`, (err) => {
    if (err) {
        console.log("❌ Erro ao criar tabela likes:", err);
    } else {
        console.log("✅ Tabela likes criada/verificada com sucesso!");
    }
});

// ===== TABELAS PARA O CHAT =====
db.query(`
    CREATE TABLE IF NOT EXISTS mensagens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        remetente VARCHAR(50) NOT NULL,
        destinatario VARCHAR(50),
        turma VARCHAR(10),
        mensagem TEXT NOT NULL,
        tipo ENUM('geral', 'privado') DEFAULT 'geral',
        lida BOOLEAN DEFAULT FALSE,
        editada BOOLEAN DEFAULT FALSE,
        deletada BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`);

db.query(`
    CREATE TABLE IF NOT EXISTS usuarios_digitando (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario VARCHAR(50) NOT NULL,
        destinatario VARCHAR(50),
        turma VARCHAR(10),
        digitando BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_digitando (usuario, destinatario, turma)
    )
`);

// ===== VERIFICAR E CORRIGIR ESTRUTURA DA TABELA LIKES =====
db.query("SHOW COLUMNS FROM likes", (err, result) => {
    if (err) {
        console.log("❌ Erro ao verificar tabela likes:", err);
    } else {
        console.log("📊 Estrutura atual da tabela likes:");
        const colunas = {};
        result.forEach(col => {
            console.log(`   - ${col.Field}: ${col.Type}`);
            colunas[col.Field] = true;
        });
        
        if (!colunas.recado_id) {
            console.log("⚠️ Coluna 'recado_id' não encontrada! Adicionando...");
            db.query("ALTER TABLE likes ADD COLUMN recado_id INT", (err) => {
                if (err) {
                    console.log("❌ Erro ao adicionar coluna recado_id:", err);
                } else {
                    console.log("✅ Coluna recado_id adicionada com sucesso!");
                }
            });
        }
        
        if (!colunas.limpeza_id) {
            console.log("⚠️ Coluna 'limpeza_id' não encontrada! Adicionando...");
            db.query("ALTER TABLE likes ADD COLUMN limpeza_id INT", (err) => {
                if (err) {
                    console.log("❌ Erro ao adicionar coluna limpeza_id:", err);
                } else {
                    console.log("✅ Coluna limpeza_id adicionada com sucesso!");
                }
            });
        }
        
        if (!colunas.patio_id) {
            console.log("⚠️ Coluna 'patio_id' não encontrada! Adicionando...");
            db.query("ALTER TABLE likes ADD COLUMN patio_id INT", (err) => {
                if (err) {
                    console.log("❌ Erro ao adicionar coluna patio_id:", err);
                } else {
                    console.log("✅ Coluna patio_id adicionada com sucesso!");
                }
            });
        }
    }
});

// ===== VERIFICAR E ADICIONAR COLUNAS NA TABELA USUARIOS =====
db.query("SHOW COLUMNS FROM usuarios", (err, result) => {
    if (err) {
        console.log("❌ Erro ao verificar tabela usuarios:", err);
    } else {
        console.log("📊 Verificando colunas da tabela usuarios:");
        const colunas = {};
        result.forEach(col => {
            colunas[col.Field] = true;
        });
        
        const colunasNecessarias = [
            { nome: 'email', tipo: 'VARCHAR(100)' },
            { nome: 'telefone', tipo: 'VARCHAR(20)' },
            { nome: 'endereco', tipo: 'TEXT' },
            { nome: 'nome_pai', tipo: 'VARCHAR(100)' },
            { nome: 'nome_mae', tipo: 'VARCHAR(100)' },
            { nome: 'foto', tipo: 'VARCHAR(255)' },
            { nome: 'reset_token', tipo: 'VARCHAR(100)' },
            { nome: 'reset_expira', tipo: 'DATETIME' }
        ];
        
        colunasNecessarias.forEach(col => {
            if (!colunas[col.nome]) {
                console.log(`⚠️ Coluna '${col.nome}' não encontrada! Adicionando...`);
                db.query(`ALTER TABLE usuarios ADD COLUMN ${col.nome} ${col.tipo}`, (err) => {
                    if (err) {
                        console.log(`❌ Erro ao adicionar coluna ${col.nome}:`, err);
                    } else {
                        console.log(`✅ Coluna ${col.nome} adicionada com sucesso!`);
                    }
                });
            }
        });
    }
});

// ===== SENHAS PRÉ-DEFINIDAS PARA CADA CARGO/TURMA =====
const senhasCargo = {
    "Aluno_1A": "aluno1a2024",
    "Aluno_2A": "aluno2a2024",
    "Aluno_3A": "aluno3a2024",
    "Professor": "prof2024",
    "Professor Apoio": "apoio2024",
    "Diretor": "diretor2024",
    "Vice Diretor": "vice2024",
    "Coordenador": "coord2024",
    "Agente Merenda": "merenda2024",
    "Profissional Limpeza": "limpeza2024",
    "Cuidador Patio": "patio2024"
};

// ===== CONFIGURAÇÃO DA RÁDIO (URL DIRETA DO STREAM) =====
const RADIO_STREAM_URL = "http://trendfm.live-streams.nl:8030/main";

// ================= LAYOUT =================
function layout(titulo, conteudo, user, userCargo = null, userTurma = null) {

    let seletorTurmas = "";
    let seletorTurmasBoletim = "";

    if (user && (userCargo === 'Diretor' || userCargo === 'Vice Diretor' || userCargo === 'Coordenador' || userCargo === 'Professor')) {
        seletorTurmas = `
        <div style="margin-top:10px; display: flex; gap: 5px;">
            <a href="/turma/1A"><button>1º Ano A</button></a>
            <a href="/turma/2A"><button>2º Ano A</button></a>
            <a href="/turma/3A"><button>3º Ano A</button></a>
        </div>
        `;
        
        seletorTurmasBoletim = `
        <div style="margin-top:10px; display: flex; gap: 5px;">
            <a href="/boletim/1A"><button>1º Ano A</button></a>
            <a href="/boletim/2A"><button>2º Ano A</button></a>
            <a href="/boletim/3A"><button>3º Ano A</button></a>
        </div>
        `;
    }

    let userInfo = user ? `Olá, ${user} (${userCargo || 'Usuário'})` : '';

    return `<!DOCTYPE html>
<html>
<head>
    <title>${titulo}</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        /* ===== ESTILOS (mantidos os mesmos do seu código) ===== */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        html, body {
            height: 100%;
            font-family: 'Segoe UI', Arial, sans-serif;
            background: #f0f4f8;
        }

        header {
            background: linear-gradient(90deg, #004080, #0073e6);
            color: white;
            padding: 15px 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }

        .header-left {
            display: flex;
            align-items: center;
            gap: 20px;
            flex-wrap: wrap;
        }

        .header-right {
            display: flex;
            align-items: center;
            gap: 20px;
        }

        .logout {
            color: white;
            text-decoration: none;
            padding: 8px 15px;
            border-radius: 20px;
            background: rgba(255,255,255,0.2);
            transition: 0.3s;
        }

        .logout:hover {
            background: rgba(255,255,255,0.3);
        }

        .logoBtn {
            color: white;
            text-decoration: none;
            font-weight: bold;
            font-size: 20px;
            padding: 8px 15px;
            border-radius: 8px;
            display: inline-block;
            transition: 0.3s;
        }

        .logoBtn:hover {
            background: rgba(255, 255, 255, 0.2);
        }

        .main {
            display: flex;
            min-height: calc(100vh - 70px);
            position: relative;
        }

        .sidebar {
            width: 250px;
            background: #0d3c6e;
            color: white;
            padding: 20px 10px;
            flex-shrink: 0;
            box-shadow: 2px 0 10px rgba(0,0,0,0.1);
        }

        .sidebar h3 {
            margin-bottom: 20px;
            padding-left: 10px;
            font-size: 1.2em;
            color: #ffd700;
        }

        .menuBtn {
            display: block;
            background: #1c5fa8;
            color: white;
            text-decoration: none;
            padding: 12px 15px;
            margin: 8px 0;
            border-radius: 8px;
            transition: 0.3s;
            font-size: 16px;
        }

        .menuBtn:hover {
            background: #2b7bdc;
            transform: translateX(5px);
        }

        .content {
            flex: 1;
            padding: 30px;
            overflow-y: auto;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        button {
            background: #0073e6;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 25px;
            cursor: pointer;
            margin: 5px;
            font-size: 14px;
            font-weight: 600;
            transition: 0.3s;
            box-shadow: 0 2px 5px rgba(0,115,230,0.3);
        }

        button:hover {
            background: #0056b3;
            transform: translateY(-2px);
            box-shadow: 0 4px 10px rgba(0,115,230,0.4);
        }

        input, select, textarea {
            padding: 12px;
            margin: 8px 0;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            width: 100%;
            box-sizing: border-box;
            font-size: 14px;
            transition: 0.3s;
        }

        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: #0073e6;
            box-shadow: 0 0 0 3px rgba(0,115,230,0.1);
        }

        .form-group {
            margin: 20px 0;
        }

        .alert {
            padding: 15px;
            margin: 20px 0;
            border-radius: 8px;
            font-weight: 500;
        }

        .alert-success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }

        .alert-error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }

        .feed-container {
            max-width: 900px;
            margin: 0 auto;
        }

        .post-form {
            background: white;
            border-radius: 15px;
            padding: 25px;
            margin-bottom: 30px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }

        .post-form h3 {
            color: #004080;
            margin-bottom: 20px;
            font-size: 1.3em;
        }

        .post {
            background: white;
            border-radius: 15px;
            padding: 25px;
            margin-bottom: 25px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            transition: 0.3s;
        }

        .post:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.15);
        }

        .post-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #f0f0f0;
        }

        .post-author {
            font-weight: bold;
            color: #004080;
            font-size: 1.1em;
        }

        .post-date {
            color: #666;
            font-size: 12px;
        }

        .post-content {
            margin: 20px 0;
            line-height: 1.6;
            font-size: 1.1em;
        }

        .post-media {
            max-width: 100%;
            margin: 20px 0;
            border-radius: 10px;
            box-shadow: 0 3px 10px rgba(0,0,0,0.1);
        }

        .post-media img, .post-media video {
            max-width: 100%;
            border-radius: 10px;
        }

        .post-actions {
            display: flex;
            gap: 15px;
            margin: 20px 0;
            padding-top: 15px;
            border-top: 2px solid #f0f0f0;
            flex-wrap: wrap;
        }

        .action-btn {
            background: none;
            border: none;
            color: #666;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            padding: 8px 15px;
            border-radius: 25px;
            transition: 0.3s;
            text-decoration: none;
        }

        .action-btn:hover {
            background: #f0f0f0;
            color: #0073e6;
        }

        .action-btn.liked {
            color: #e63946;
            background: #ffe5e5;
        }

        .comentarios-section {
            margin-top: 20px;
            border-top: 2px solid #f0f0f0;
            padding-top: 20px;
        }

        .comentario {
            margin: 15px 0;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 10px;
            border-left: 4px solid #0073e6;
        }

        .comentario-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 0.9em;
        }

        .comentario-author {
            font-weight: bold;
            color: #004080;
        }

        .comentario-texto {
            margin: 10px 0;
            line-height: 1.5;
        }

        .comentario-actions {
            display: flex;
            gap: 10px;
            margin-top: 10px;
        }

        .tipo-selector {
            display: flex;
            gap: 10px;
            margin: 20px 0;
            flex-wrap: wrap;
        }

        .tipo-btn {
            flex: 1;
            min-width: 80px;
            background: #f0f0f0;
            color: #333;
            box-shadow: none;
        }

        .tipo-btn.active {
            background: #0073e6;
            color: white;
        }

        .hidden {
            display: none !important;
        }

        .edit-form {
            margin: 20px 0;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 10px;
        }

        a {
            color: #0073e6;
            text-decoration: none;
            font-weight: 500;
        }

        a:hover {
            text-decoration: underline;
        }

        h2 {
            color: #004080;
            margin-bottom: 25px;
            font-size: 2em;
            text-align: center;
        }

        .turmas-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-top: 30px;
        }

        .turma-card {
            background: white;
            border-radius: 15px;
            padding: 30px;
            text-align: center;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            transition: 0.3s;
            cursor: pointer;
        }

        .turma-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.15);
        }

        .turma-card h3 {
            color: #004080;
            font-size: 1.5em;
            margin-bottom: 10px;
        }

        .pdf-viewer {
            width: 100%;
            height: 600px;
            border: none;
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }

        .pdf-container {
            background: white;
            border-radius: 15px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }

        .pdf-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #f0f0f0;
        }

        .pdf-title {
            font-size: 1.2em;
            font-weight: bold;
            color: #004080;
        }

        .pdf-info {
            color: #666;
            font-size: 0.9em;
        }

        .pdf-download {
            background: #28a745;
            color: white;
            padding: 5px 15px;
            border-radius: 20px;
            text-decoration: none;
            font-size: 0.9em;
        }

        .pdf-download:hover {
            background: #218838;
            text-decoration: none;
        }

        .profile-container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }

        .profile-header {
            display: flex;
            align-items: center;
            gap: 30px;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #f0f0f0;
        }

        .profile-avatar {
            width: 150px;
            height: 150px;
            border-radius: 50%;
            background: #0073e6;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 48px;
            font-weight: bold;
            overflow: hidden;
        }

        .profile-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .profile-info {
            flex: 1;
        }

        .profile-name {
            font-size: 24px;
            font-weight: bold;
            color: #004080;
            margin-bottom: 5px;
        }

        .profile-cargo {
            color: #666;
            font-size: 16px;
            margin-bottom: 10px;
        }

        .profile-stats {
            display: flex;
            gap: 20px;
        }

        .stat-item {
            text-align: center;
        }

        .stat-value {
            font-size: 20px;
            font-weight: bold;
            color: #004080;
        }

        .stat-label {
            font-size: 12px;
            color: #666;
        }

        .profile-details {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            margin-bottom: 30px;
        }

        .detail-item {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 10px;
        }

        .detail-label {
            font-size: 12px;
            color: #666;
            margin-bottom: 5px;
        }

        .detail-value {
            font-size: 16px;
            font-weight: 500;
            color: #004080;
        }

        .profile-actions {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        }

        .edit-profile-form {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            margin-top: 20px;
        }

        .chat-toggle {
            position: fixed;
            bottom: 30px;
            right: 30px;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: #0073e6;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(0,115,230,0.4);
            z-index: 1000;
            transition: 0.3s;
            font-size: 24px;
        }

        .chat-toggle:hover {
            transform: scale(1.1);
            background: #0056b3;
        }

        .chat-toggle .notification-badge {
            position: absolute;
            top: -5px;
            right: -5px;
            background: #ff4444;
            color: white;
            border-radius: 50%;
            width: 22px;
            height: 22px;
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
        }

        .chatbox {
            position: fixed;
            bottom: 100px;
            right: 30px;
            width: 350px;
            height: 500px;
            background: white;
            border-radius: 15px;
            box-shadow: 0 5px 30px rgba(0,0,0,0.2);
            display: none;
            flex-direction: column;
            z-index: 1000;
            overflow: hidden;
        }

        .chatbox.visible {
            display: flex;
        }

        .chat-header {
            background: #0073e6;
            color: white;
            padding: 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
        }

        .chat-header h3 {
            font-size: 16px;
            margin: 0;
        }

        .chat-header-buttons {
            display: flex;
            gap: 10px;
        }

        .chat-header-buttons button {
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            font-size: 16px;
            padding: 0 5px;
            margin: 0;
            box-shadow: none;
        }

        .chat-header-buttons button:hover {
            background: rgba(255,255,255,0.2);
        }

        .chat-tabs {
            display: flex;
            border-bottom: 1px solid #e0e0e0;
        }

        .chat-tab {
            flex: 1;
            padding: 10px;
            text-align: center;
            cursor: pointer;
            background: #f5f5f5;
            transition: 0.3s;
        }

        .chat-tab.active {
            background: white;
            font-weight: bold;
            color: #0073e6;
            border-bottom: 2px solid #0073e6;
        }

        .chat-contacts {
            flex: 1;
            overflow-y: auto;
            padding: 10px;
        }

        .contact-item {
            display: flex;
            align-items: center;
            padding: 10px;
            border-radius: 8px;
            cursor: pointer;
            transition: 0.3s;
            margin-bottom: 5px;
            position: relative;
        }

        .contact-item:hover {
            background: #f0f0f0;
        }

        .contact-item.active {
            background: #e3f2fd;
        }

        .contact-avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: #0073e6;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            margin-right: 10px;
            position: relative;
        }

        .online-indicator {
            position: absolute;
            bottom: 0;
            right: 0;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            border: 2px solid white;
        }

        .online-indicator.online {
            background: #4caf50;
        }

        .online-indicator.offline {
            background: #999;
        }

        .contact-info {
            flex: 1;
        }

        .contact-name {
            font-weight: bold;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 5px;
        }

        .contact-cargo {
            font-size: 11px;
            color: #666;
            margin-top: 2px;
        }

        .contact-status {
            font-size: 11px;
            color: #666;
            margin-top: 2px;
        }
        
        .status-online {
            color: #4caf50;
        }
        
        .status-offline {
            color: #999;
        }

        .contact-badge {
            background: #ff4444;
            color: white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            font-size: 11px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-left: 5px;
        }

        .chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 15px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .message {
            position: relative;
            max-width: 80%;
            padding: 8px 12px;
            border-radius: 15px;
            word-wrap: break-word;
            margin-bottom: 5px;
        }

        .message.sent {
            align-self: flex-end;
            background: #0073e6;
            color: white;
            border-bottom-right-radius: 5px;
        }

        .message.received {
            align-self: flex-start;
            background: #f0f0f0;
            border-bottom-left-radius: 5px;
        }

        .message.deleted {
            opacity: 0.7;
            font-style: italic;
            background: #e0e0e0;
        }

        .message.deleted .message-content {
            color: #666;
        }

        .message-options {
            position: absolute;
            top: 2px;
            right: 2px;
            display: none;
            gap: 5px;
            background: rgba(255,255,255,0.9);
            border-radius: 15px;
            padding: 2px 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }

        .message.sent .message-options {
            background: rgba(0,115,230,0.9);
        }

        .message:hover .message-options {
            display: flex;
        }

        .message-option-btn {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 12px;
            padding: 2px 5px;
            border-radius: 10px;
            color: #333;
            transition: 0.2s;
            box-shadow: none;
            margin: 0;
        }

        .message.sent .message-option-btn {
            color: white;
        }

        .message-option-btn:hover {
            background: rgba(0,0,0,0.1);
            transform: scale(1.1);
        }

        .edit-message-input {
            width: 100%;
            padding: 8px;
            border: 2px solid #0073e6;
            border-radius: 10px;
            font-size: 14px;
            margin-top: 5px;
        }

        .edit-actions {
            display: flex;
            gap: 5px;
            margin-top: 5px;
        }

        .edit-actions button {
            padding: 5px 10px;
            font-size: 12px;
            margin: 0;
        }

        .edited-indicator {
            font-size: 10px;
            opacity: 0.7;
            font-style: italic;
            margin-left: 5px;
        }

        .message-time {
            font-size: 10px;
            opacity: 0.7;
            margin-top: 5px;
            text-align: right;
        }

        .typing-indicator {
            padding: 10px;
            font-size: 12px;
            color: #666;
            font-style: italic;
        }

        .chat-input-area {
            padding: 15px;
            border-top: 1px solid #e0e0e0;
            display: flex;
            gap: 10px;
            align-items: center;
            position: relative;
        }

        .chat-input-area input {
            flex: 1;
            margin: 0;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 20px;
            font-size: 14px;
        }

        .chat-input-area input:focus {
            outline: none;
            border-color: #0073e6;
        }

        .emoji-button {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            padding: 5px 10px;
            margin: 0;
            box-shadow: none;
            background: transparent;
            color: #666;
            transition: 0.2s;
        }

        .emoji-button:hover {
            background: #f0f0f0;
            transform: scale(1.1);
            box-shadow: none;
            border-radius: 50%;
        }

        .emoji-picker-container {
            position: relative;
            display: inline-block;
        }

        .emoji-picker {
            position: absolute;
            bottom: 50px;
            right: 0;
            background: white;
            border-radius: 10px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.2);
            padding: 10px;
            display: grid;
            grid-template-columns: repeat(8, 1fr);
            gap: 5px;
            z-index: 1002;
            width: 280px;
            border: 1px solid #e0e0e0;
        }

        .emoji-picker span {
            cursor: pointer;
            padding: 5px;
            text-align: center;
            font-size: 20px;
            border-radius: 5px;
            transition: 0.2s;
        }

        .emoji-picker span:hover {
            background: #f0f0f0;
            transform: scale(1.2);
        }

        .send-button {
            background: #0073e6;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 20px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: 0.3s;
            white-space: nowrap;
        }

        .send-button:hover {
            background: #0056b3;
            transform: translateY(-2px);
        }

        .chat-notification {
            position: absolute;
            top: 10px;
            right: 10px;
            background: #ff4444;
            color: white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            font-size: 11px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.2); }
            100% { transform: scale(1); }
        }
        
        .like-btn.liked {
            animation: pulse 0.3s ease;
        }
        
        .like-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .calendario-container {
            background: white;
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            margin-bottom: 30px;
        }

        .calendario-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }

        .calendario-titulo {
            font-size: 24px;
            font-weight: bold;
            color: #004080;
        }

        .calendario-navegacao {
            display: flex;
            gap: 10px;
        }

        .calendario-grid {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 5px;
        }

        .calendario-dia-semana {
            text-align: center;
            font-weight: bold;
            padding: 10px;
            background: #f0f4f8;
            border-radius: 8px;
            color: #004080;
        }

        .calendario-dia {
            text-align: center;
            padding: 15px 5px;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            cursor: pointer;
            transition: 0.3s;
            position: relative;
            min-height: 80px;
        }

        .calendario-dia:hover {
            background: #e3f2fd;
            transform: translateY(-2px);
            box-shadow: 0 4px 10px rgba(0,0,0,0.1);
        }

        .calendario-dia.feriado {
            background: #ffebee;
            border-color: #ffcdd2;
        }

        .calendario-dia.evento {
            background: #e8f5e9;
            border-color: #c8e6c9;
        }

        .calendario-dia.outro-mes {
            opacity: 0.5;
        }

        .calendario-dia .dia-numero {
            font-weight: bold;
            margin-bottom: 5px;
        }

        .calendario-dia .dia-evento {
            font-size: 10px;
            background: #0073e6;
            color: white;
            padding: 2px 4px;
            border-radius: 4px;
            margin: 2px 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .calendario-dia.feriado .dia-evento {
            background: #e53935;
        }

        .eventos-lista {
            background: white;
            border-radius: 15px;
            padding: 20px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }

        .evento-item {
            padding: 15px;
            border-bottom: 1px solid #e0e0e0;
            transition: 0.3s;
        }

        .evento-item:hover {
            background: #f5f5f5;
        }

        .evento-item:last-child {
            border-bottom: none;
        }

        .evento-titulo {
            font-weight: bold;
            color: #004080;
            font-size: 16px;
        }

        .evento-data {
            color: #666;
            font-size: 12px;
            margin: 5px 0;
        }

        .evento-descricao {
            color: #333;
            font-size: 14px;
            line-height: 1.5;
        }

        .evento-tipo {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: bold;
            margin-right: 10px;
        }

        .tipo-evento {
            background: #e3f2fd;
            color: #1976d2;
        }

        .tipo-feriado {
            background: #ffebee;
            color: #c62828;
        }

        .tipo-comunicado {
            background: #fff3e0;
            color: #ef6c00;
        }

        .comunicado-item {
            padding: 20px;
            margin-bottom: 15px;
            border-radius: 10px;
            background: #f8f9fa;
            border-left: 4px solid #0073e6;
        }

        .comunicado-item.importante {
            background: #fff3e0;
            border-left-color: #f57c00;
        }

        .comunicado-titulo {
            font-weight: bold;
            color: #004080;
            font-size: 18px;
            margin-bottom: 10px;
        }

        .comunicado-conteudo {
            color: #333;
            line-height: 1.6;
            margin-bottom: 10px;
        }

        .comunicado-autor {
            color: #666;
            font-size: 12px;
            text-align: right;
        }

        .feriados-lista {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }

        .feriado-card {
            background: #fff9c4;
            padding: 15px;
            border-radius: 10px;
            border-left: 4px solid #fbc02d;
        }

        .feriado-data {
            font-weight: bold;
            color: #f57f17;
            font-size: 14px;
        }

        .feriado-nome {
            color: #333;
            font-size: 16px;
            margin-top: 5px;
        }

        /* ===== ESTILOS DA RÁDIO - REPOSICIONADOS (FIXO) COM BOTÃO DE RECOLHER ===== */
        .radio-mini-player {
            position: fixed;
            top: 120px;          /* Descido para 120px para não tampar o perfil */
            right: 20px;
            z-index: 1001;      /* acima do chat toggle (z-index 1000) */
            background: white;
            border-radius: 50px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.25);
            padding: 8px 16px;
            display: flex;
            align-items: center;
            gap: 12px;
            transition: all 0.3s ease;
            border: 2px solid #0073e6;
            max-width: 500px;
            width: auto;
        }

        .radio-mini-player:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0,115,230,0.4);
        }

        .radio-mini-player.playing {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-color: white;
        }

        .radio-mini-player.playing button {
            color: white;
        }

        .radio-mini-player .radio-info-compact {
            display: flex;
            flex-direction: column;
            min-width: 180px;
        }

        .radio-mini-player .radio-song-title {
            font-weight: bold;
            font-size: 13px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 180px;
        }

        .radio-mini-player .radio-song-artist {
            font-size: 11px;
            opacity: 0.8;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 180px;
        }

        .radio-mini-player.playing .radio-song-title,
        .radio-mini-player.playing .radio-song-artist {
            color: white;
        }

        .radio-mini-player button {
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            padding: 5px;
            margin: 0;
            box-shadow: none;
            color: #333;
            transition: transform 0.2s;
        }

        .radio-mini-player button:hover {
            transform: scale(1.2);
            background: none;
        }
        
        /* Botão de recolher/esticar */
        .radio-toggle-btn {
            background: none;
            border: none;
            font-size: 18px;
            cursor: pointer;
            padding: 5px;
            margin: 0 0 0 5px;
            box-shadow: none;
            color: #333;
            transition: transform 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .radio-mini-player.playing .radio-toggle-btn {
            color: white;
        }

        .radio-toggle-btn:hover {
            transform: scale(1.1);
            background: none;
        }
        
        /* Versão minimizada do player (apenas um botão) */
        .radio-mini-player.minimized {
            padding: 8px 12px;
            width: auto;
        }
        
        .radio-mini-player.minimized .radio-info-compact,
        .radio-mini-player.minimized .radio-volume-control,
        .radio-mini-player.minimized .radio-equalizer {
            display: none;
        }
        
        .radio-mini-player.minimized button:first-of-type {
            margin-right: 5px;
        }
        
        .radio-mini-player.minimized .radio-toggle-btn {
            margin-left: 0;
        }

        .radio-volume-control {
            display: flex;
            align-items: center;
            gap: 5px;
        }

        .radio-volume-control input {
            width: 60px;
            margin: 0;
            padding: 0;
            height: 4px;
        }

        .radio-status {
            font-size: 12px;
            font-weight: 500;
            min-width: 50px;
        }

        .radio-equalizer {
            display: flex;
            gap: 2px;
            height: 16px;
            align-items: flex-end;
        }

        .radio-equalizer span {
            width: 3px;
            height: 8px;
            background: #0073e6;
            border-radius: 2px;
            animation: equalize 1s ease-in-out infinite;
        }

        .radio-mini-player.playing .radio-equalizer span {
            background: white;
        }

        .radio-equalizer span:nth-child(2) {
            animation-delay: 0.2s;
            height: 12px;
        }

        .radio-equalizer span:nth-child(3) {
            animation-delay: 0.4s;
            height: 10px;
        }

        .radio-equalizer span:nth-child(4) {
            animation-delay: 0.6s;
            height: 14px;
        }

        @keyframes equalize {
            0%, 100% { height: 6px; }
            50% { height: 16px; }
        }

        .radio-tooltip {
            position: absolute;
            top: 60px;
            right: 0;
            background: white;
            border-radius: 10px;
            padding: 15px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            display: none;
            width: 280px;
            z-index: 1000;
            border: 1px solid #e0e0e0;
        }

        .radio-mini-player:hover .radio-tooltip {
            display: block;
        }

        .radio-tooltip h4 {
            margin-bottom: 10px;
            color: #004080;
            font-size: 14px;
        }

        .radio-tooltip .radio-controls {
            display: flex;
            justify-content: center;
            gap: 10px;
            margin: 10px 0;
        }

        .radio-tooltip .radio-controls button {
            font-size: 16px;
            padding: 5px 12px;
            border-radius: 20px;
            background: #f0f0f0;
        }

        .radio-tooltip .radio-controls button:hover {
            background: #0073e6;
            color: white;
        }

        .radio-tooltip .radio-volume {
            margin: 10px 0;
            text-align: center;
        }

        .radio-tooltip .radio-volume input {
            width: 100%;
            margin: 5px 0;
        }

        .radio-tooltip .radio-current-song {
            background: #f0f4f8;
            padding: 10px;
            border-radius: 8px;
            margin-top: 10px;
        }

        .radio-tooltip .radio-current-song .song-title {
            font-weight: bold;
            color: #004080;
            font-size: 14px;
        }

        .radio-tooltip .radio-current-song .song-artist {
            font-size: 12px;
            color: #666;
        }

        /* Estilos da página da rádio */
        .radio-page {
            max-width: 800px;
            margin: 0 auto;
        }
        
        .radio-main-player {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 20px;
            padding: 40px;
            color: white;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        
        .radio-cover img {
            width: 200px;
            height: 200px;
            border-radius: 50%;
            object-fit: cover;
            margin-bottom: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            animation: rotate 20s linear infinite;
            animation-play-state: paused;
        }
        
        .radio-cover img.playing {
            animation-play-state: running;
        }
        
        @keyframes rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        
        .radio-info h3 {
            font-size: 28px;
            margin-bottom: 10px;
        }
        
        .radio-genre {
            opacity: 0.9;
            margin-bottom: 30px;
        }
        
        .radio-big-controls {
            display: flex;
            justify-content: center;
            gap: 20px;
            margin: 30px 0;
        }
        
        .radio-big-btn {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            border: none;
            font-size: 32px;
            cursor: pointer;
            background: white;
            color: #667eea;
            transition: all 0.3s;
            box-shadow: 0 5px 20px rgba(0,0,0,0.2);
        }
        
        .radio-big-btn:hover {
            transform: scale(1.1);
        }
        
        .radio-volume-big {
            margin: 20px 0;
        }
        
        .radio-volume-big input {
            width: 300px;
            margin-left: 10px;
        }
        
        .radio-status-big {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            padding: 15px;
            background: rgba(255,255,255,0.1);
            border-radius: 30px;
        }
        
        .status-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            display: inline-block;
        }
        
        .status-dot.online {
            background: #4CAF50;
            animation: pulse 2s infinite;
        }
        
        .status-dot.offline {
            background: #999;
        }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        
        .radio-info-box {
            background: white;
            border-radius: 15px;
            padding: 30px;
            margin-top: 30px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        
        .radio-info-box h4 {
            color: #004080;
            margin-bottom: 20px;
            font-size: 20px;
        }
        
        .radio-info-box p {
            margin: 10px 0;
            color: #666;
            font-size: 16px;
        }

        .radio-now-playing {
            margin-top: 30px;
            padding: 20px;
            background: #f0f4f8;
            border-radius: 15px;
        }

        .radio-now-playing h4 {
            color: #004080;
            margin-bottom: 10px;
        }

        .radio-now-playing .current-song {
            font-size: 18px;
            font-weight: bold;
            color: #0073e6;
        }

        .radio-now-playing .current-artist {
            font-size: 14px;
            color: #666;
        }
    </style>
</head>
<body>
    <header>
        <div class="header-left">
            <a href="/" class="logoBtn">🎓 Portal Escolar</a>
            ${seletorTurmas}
            ${seletorTurmasBoletim}
        </div>
        <div class="header-right">
            ${userInfo ? `<span style="font-weight: 500;">${userInfo}</span>` : ''}
            ${user ? `<a class="logout" href="/logout">Sair</a>` : ""}
            ${user ? `<a href="/perfil" style="color: white; text-decoration: none; padding: 8px 15px; border-radius: 20px; background: rgba(255,255,255,0.2);">👤 Perfil</a>` : ""}
        </div>
    </header>

    <div class="main">
        <div class="sidebar">
            <h3>📌 Menu</h3>
            <a href="/" class="menuBtn">🏠 Início</a>
            <a href="/boletim" class="menuBtn">📄 Boletim</a>
            <a href="/horarios" class="menuBtn">⏰ Horários</a>
            <a href="/eventos" class="menuBtn">📅 Eventos</a>
            <a href="/recados" class="menuBtn">📢 Recados</a>
            <a href="/cardapio" class="menuBtn">🍽️ Cardápio Semanal</a>
            <a href="/limpeza" class="menuBtn">🧹 Limpeza</a>
            <a href="/patio" class="menuBtn">🏃 Pátio/Manutenção</a>
            <a href="/radio" class="menuBtn">📻 Rádio Online</a>
        </div>

        <div class="content">
            <div class="container">
                ${conteudo}
            </div>
        </div>
    </div>

    ${user ? `
    <!-- Chatbox Flutuante -->
    <div class="chat-toggle" id="chatToggle" onclick="toggleChat()">
        💬
        <span class="notification-badge" id="chatNotification" style="display: none;">0</span>
    </div>

    <div class="chatbox" id="chatbox">
        <div class="chat-header" onclick="toggleChat()">
            <h3>💬 Chat da Turma</h3>
            <div class="chat-header-buttons" onclick="event.stopPropagation()">
                <button onclick="minimizeChat()">−</button>
                <button onclick="closeChat()">×</button>
            </div>
        </div>

        <div class="chat-tabs">
            <div class="chat-tab active" onclick="switchChatTab('geral')" id="tab-geral">Geral</div>
            <div class="chat-tab" onclick="switchChatTab('privado')" id="tab-privado">Privado</div>
        </div>

        <!-- Aba Geral -->
        <div id="chat-geral" style="display: flex; flex-direction: column; height: 100%;">
            <div class="chat-messages" id="chatMessagesGeral"></div>
            <div class="typing-indicator" id="typingGeral"></div>
            <div class="chat-input-area">
                <input type="text" id="chatInputGeral" placeholder="Digite uma mensagem..." onkeydown="handleKeyDown(event, 'geral')">
                <div class="emoji-picker-container">
                    <button class="emoji-button" onclick="toggleEmojiPicker(event, 'geral')">😊</button>
                    <div class="emoji-picker hidden" id="emojiPickerGeral">
                        <span onclick="addEmoji('😊', 'geral')">😊</span>
                        <span onclick="addEmoji('😂', 'geral')">😂</span>
                        <span onclick="addEmoji('😍', 'geral')">😍</span>
                        <span onclick="addEmoji('😎', 'geral')">😎</span>
                        <span onclick="addEmoji('👍', 'geral')">👍</span>
                        <span onclick="addEmoji('👏', 'geral')">👏</span>
                        <span onclick="addEmoji('🎉', 'geral')">🎉</span>
                        <span onclick="addEmoji('❤️', 'geral')">❤️</span>
                        <span onclick="addEmoji('🔥', 'geral')">🔥</span>
                        <span onclick="addEmoji('✅', 'geral')">✅</span>
                        <span onclick="addEmoji('❌', 'geral')">❌</span>
                        <span onclick="addEmoji('⭐', 'geral')">⭐</span>
                        <span onclick="addEmoji('🤔', 'geral')">🤔</span>
                        <span onclick="addEmoji('😢', 'geral')">😢</span>
                        <span onclick="addEmoji('😡', 'geral')">😡</span>
                        <span onclick="addEmoji('🥳', 'geral')">🥳</span>
                        <span onclick="addEmoji('🙏', 'geral')">🙏</span>
                        <span onclick="addEmoji('💪', 'geral')">💪</span>
                        <span onclick="addEmoji('🤝', 'geral')">🤝</span>
                        <span onclick="addEmoji('👋', 'geral')">👋</span>
                        <span onclick="addEmoji('✌️', 'geral')">✌️</span>
                        <span onclick="addEmoji('🤞', 'geral')">🤞</span>
                        <span onclick="addEmoji('👌', 'geral')">👌</span>
                        <span onclick="addEmoji('💯', 'geral')">💯</span>
                    </div>
                </div>
                <button class="send-button" onclick="sendMessage('geral')">Enviar</button>
            </div>
        </div>

        <!-- Aba Privado -->
        <div id="chat-privado" style="display: none; height: 100%;">
            <div class="chat-contacts" id="chatContacts"></div>
            <div id="chatConversa" style="display: none; flex-direction: column; height: 100%;">
                <div class="chat-header" style="background: #f0f0f0; color: #333;" onclick="event.stopPropagation()">
                    <h3 id="conversaCom"></h3>
                    <button onclick="voltarContatos()">← Voltar</button>
                </div>
                <div class="chat-messages" id="chatMessagesPrivado"></div>
                <div class="typing-indicator" id="typingPrivado"></div>
                <div class="chat-input-area">
                    <input type="text" id="chatInputPrivado" placeholder="Digite uma mensagem..." onkeydown="handleKeyDown(event, 'privado')">
                    <div class="emoji-picker-container">
                        <button class="emoji-button" onclick="toggleEmojiPicker(event, 'privado')">😊</button>
                        <div class="emoji-picker hidden" id="emojiPickerPrivado">
                            <span onclick="addEmoji('😊', 'privado')">😊</span>
                            <span onclick="addEmoji('😂', 'privado')">😂</span>
                            <span onclick="addEmoji('😍', 'privado')">😍</span>
                            <span onclick="addEmoji('😎', 'privado')">😎</span>
                            <span onclick="addEmoji('👍', 'privado')">👍</span>
                            <span onclick="addEmoji('👏', 'privado')">👏</span>
                            <span onclick="addEmoji('🎉', 'privado')">🎉</span>
                            <span onclick="addEmoji('❤️', 'privado')">❤️</span>
                            <span onclick="addEmoji('🔥', 'privado')">🔥</span>
                            <span onclick="addEmoji('✅', 'privado')">✅</span>
                            <span onclick="addEmoji('❌', 'privado')">❌</span>
                            <span onclick="addEmoji('⭐', 'privado')">⭐</span>
                            <span onclick="addEmoji('🤔', 'privado')">🤔</span>
                            <span onclick="addEmoji('😢', 'privado')">😢</span>
                            <span onclick="addEmoji('😡', 'privado')">😡</span>
                            <span onclick="addEmoji('🥳', 'privado')">🥳</span>
                            <span onclick="addEmoji('🙏', 'privado')">🙏</span>
                            <span onclick="addEmoji('💪', 'privado')">💪</span>
                            <span onclick="addEmoji('🤝', 'privado')">🤝</span>
                            <span onclick="addEmoji('👋', 'privado')">👋</span>
                            <span onclick="addEmoji('✌️', 'privado')">✌️</span>
                            <span onclick="addEmoji('🤞', 'privado')">🤞</span>
                            <span onclick="addEmoji('👌', 'privado')">👌</span>
                            <span onclick="addEmoji('💯', 'privado')">💯</span>
                        </div>
                    </div>
                    <button class="send-button" onclick="sendMessage('privado')">Enviar</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Mini Player da Rádio (FIXO) COM BOTÃO DE RECOLHER - POSIÇÃO AJUSTADA -->
    <div class="radio-mini-player" id="radioMiniPlayer">
        <audio id="radioAudio" preload="none" src="${RADIO_STREAM_URL}"></audio>
        
        <div class="radio-equalizer" id="radioEqualizer">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
        </div>
        
        <div class="radio-info-compact" id="radioSongInfo">
            <span class="radio-song-title" id="radioSongTitle">Carregando...</span>
            <span class="radio-song-artist" id="radioSongArtist">Rádio Escola</span>
        </div>
        
        <button id="radioPlayPauseBtn" onclick="toggleRadio()">▶️</button>
        
        <div class="radio-volume-control">
            <button onclick="toggleMute()" id="radioMuteBtn">🔊</button>
            <input type="range" id="radioVolume" min="0" max="100" value="70" onchange="changeRadioVolume(this.value)">
        </div>
        
        <!-- Botão de recolher/esticar -->
        <button class="radio-toggle-btn" id="radioToggleBtn" onclick="toggleRadioPlayer()" title="Recolher">➖</button>
        
        <!-- Tooltip com controles avançados e música atual -->
        <div class="radio-tooltip">
            <h4>📻 Rádio Online</h4>
            
            <div class="radio-current-song">
                <div class="song-title" id="tooltipSongTitle">Carregando...</div>
                <div class="song-artist" id="tooltipSongArtist">Rádio Escola</div>
            </div>
            
            <div class="radio-controls">
                <button onclick="playRadio()">▶️ Play</button>
                <button onclick="pauseRadio()">⏸️ Pausar</button>
                <button onclick="stopRadio()">⏹️ Parar</button>
            </div>
            
            <div class="radio-volume">
                <label>Volume: <span id="volumeValue">70%</span></label>
                <input type="range" id="radioVolumeDetail" min="0" max="100" value="70" onchange="changeRadioVolumeDetail(this.value)">
            </div>
            
            <div style="text-align: center; margin-top: 10px;">
                <a href="/radio" style="color: #0073e6; text-decoration: none; font-size: 12px;">🎵 Ver player completo</a>
            </div>
        </div>
    </div>
    ` : ''}

    <script>
        // Verificar se o usuário está logado para inicializar o chat e a rádio
        const usuarioLogado = '${user || ''}';
        
        if (usuarioLogado) {
            // ===== CÓDIGO DO CHAT =====
            const socket = io();
            const usuarioAtual = '${user}';
            const turmaAtual = '${userTurma || ''}';
            let chatAtivo = 'geral';
            let conversaAtiva = null;
            let mensagensNaoLidas = 0;
            let digitandoTimeout;
            let mensagemEditando = null;
            // Objeto para armazenar status online dos contatos
            let statusContatos = {};
            
            // Definir o próprio usuário como online
            statusContatos[usuarioAtual] = true;

            socket.on('connect', () => {
                console.log('Conectado ao chat');
                socket.emit('usuario-online', { usuario: usuarioAtual, turma: turmaAtual });
                carregarContatos();
                carregarMensagensGeral();
            });

            socket.on('mensagem-recebida', (data) => {
                console.log('Mensagem recebida:', data);
                
                if (data.tipo === 'geral' && data.turma === turmaAtual) {
                    adicionarMensagem(data, 'geral');
                } else if (data.tipo === 'privado' && 
                          (data.remetente === conversaAtiva || data.destinatario === usuarioAtual)) {
                    adicionarMensagemPrivada(data);
                }
                
                if (data.remetente !== usuarioAtual) {
                    const chatbox = document.getElementById('chatbox');
                    if (!chatbox.classList.contains('visible') || 
                        (data.tipo === 'geral' && chatAtivo !== 'geral') || 
                        (data.tipo === 'privado' && data.remetente !== conversaAtiva)) {
                        mensagensNaoLidas++;
                        document.getElementById('chatNotification').style.display = 'flex';
                        document.getElementById('chatNotification').textContent = mensagensNaoLidas;
                    }
                }
            });

            socket.on('mensagem-atualizada', (data) => {
                console.log('Mensagem atualizada:', data);
                atualizarMensagem(data);
            });

            socket.on('mensagem-deletada', (data) => {
                console.log('Mensagem deletada:', data);
                deletarMensagemUI(data.id, data.tipo);
            });

            socket.on('usuario-digitando', (data) => {
                if (data.turma === turmaAtual) {
                    if (data.tipo === 'geral' && chatAtivo === 'geral') {
                        document.getElementById('typingGeral').textContent = \`\${data.usuario} está digitando...\`;
                        clearTimeout(digitandoTimeout);
                        digitandoTimeout = setTimeout(() => {
                            document.getElementById('typingGeral').textContent = '';
                        }, 2000);
                    } else if (data.tipo === 'privado' && data.remetente === conversaAtiva) {
                        document.getElementById('typingPrivado').textContent = \`\${data.usuario} está digitando...\`;
                        clearTimeout(digitandoTimeout);
                        digitandoTimeout = setTimeout(() => {
                            document.getElementById('typingPrivado').textContent = '';
                        }, 2000);
                    }
                }
            });

            socket.on('usuario-online-status', (data) => {
                statusContatos[data.usuario] = data.online;
                atualizarStatusContato(data.usuario, data.online);
                // Atualizar a exibição das mensagens gerais também
                atualizarStatusNasMensagensGerais(data.usuario, data.online);
            });

            function toggleChat() {
                const chatbox = document.getElementById('chatbox');
                chatbox.classList.toggle('visible');
                if (chatbox.classList.contains('visible')) {
                    mensagensNaoLidas = 0;
                    document.getElementById('chatNotification').style.display = 'none';
                    if (chatAtivo === 'geral') {
                        carregarMensagensGeral();
                    } else {
                        carregarContatos();
                    }
                }
                fecharTodosEmojis();
            }

            function minimizeChat() {
                document.getElementById('chatbox').classList.remove('visible');
                fecharTodosEmojis();
            }

            function closeChat() {
                document.getElementById('chatbox').classList.remove('visible');
                fecharTodosEmojis();
            }

            function switchChatTab(tab) {
                chatAtivo = tab;
                document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
                document.getElementById('tab-' + tab).classList.add('active');
                
                document.getElementById('chat-geral').style.display = tab === 'geral' ? 'flex' : 'none';
                document.getElementById('chat-privado').style.display = tab === 'privado' ? 'block' : 'none';
                
                if (tab === 'geral') {
                    carregarMensagensGeral();
                } else {
                    carregarContatos();
                }
                fecharTodosEmojis();
            }

            // FUNÇÃO ATUALIZADA: Agora carrega TODOS os usuários cadastrados na mesma turma
            function carregarContatos() {
                fetch('/api/contatos')
                    .then(response => response.json())
                    .then(contatos => {
                        const contactsDiv = document.getElementById('chatContacts');
                        contactsDiv.innerHTML = '';
                        
                        // Ordenar contatos: online primeiro, depois offline (por nome)
                        contatos.sort((a, b) => {
                            if (a.online !== b.online) {
                                return a.online ? -1 : 1;
                            }
                            return a.user.localeCompare(b.user);
                        });
                        
                        contatos.forEach(contato => {
                            if (contato.user !== usuarioAtual) {
                                const contatoEl = document.createElement('div');
                                contatoEl.className = 'contact-item';
                                contatoEl.onclick = () => iniciarConversa(contato.user);
                                
                                // Status: verde para online, cinza para offline
                                const statusClass = contato.online ? 'online' : 'offline';
                                const statusText = contato.online ? '🟢 Online' : '⚫ Offline';
                                
                                contatoEl.innerHTML = \`
                                    <div class="contact-avatar">
                                        \${contato.user.charAt(0).toUpperCase()}
                                        <span class="online-indicator \${statusClass}"></span>
                                    </div>
                                    <div class="contact-info">
                                        <div class="contact-name">
                                            \${contato.user}
                                            <span class="contact-cargo">(\${contato.cargo || 'Usuário'})</span>
                                        </div>
                                        <div class="contact-status">
                                            \${statusText}
                                        </div>
                                    </div>
                                \`;
                                contactsDiv.appendChild(contatoEl);
                            }
                        });
                        
                        // Se não houver contatos além do próprio usuário
                        if (contactsDiv.children.length === 0) {
                            contactsDiv.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Nenhum contato disponível</p>';
                        }
                    })
                    .catch(err => {
                        console.error('Erro ao carregar contatos:', err);
                        document.getElementById('chatContacts').innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Erro ao carregar contatos</p>';
                    });
            }

            function iniciarConversa(usuario) {
                conversaAtiva = usuario;
                document.getElementById('chatContacts').style.display = 'none';
                document.getElementById('chatConversa').style.display = 'flex';
                document.getElementById('conversaCom').textContent = \`Conversa com \${usuario}\`;
                
                fetch(\`/api/mensagens/privado/\${usuario}\`)
                    .then(response => response.json())
                    .then(mensagens => {
                        const messagesDiv = document.getElementById('chatMessagesPrivado');
                        messagesDiv.innerHTML = '';
                        mensagens.forEach(msg => adicionarMensagemPrivada(msg));
                        messagesDiv.scrollTop = messagesDiv.scrollHeight;
                    });
                fecharTodosEmojis();
            }

            function voltarContatos() {
                conversaAtiva = null;
                document.getElementById('chatContacts').style.display = 'block';
                document.getElementById('chatConversa').style.display = 'none';
                fecharTodosEmojis();
            }

            function carregarMensagensGeral() {
                fetch('/api/mensagens/geral')
                    .then(response => response.json())
                    .then(mensagens => {
                        const messagesDiv = document.getElementById('chatMessagesGeral');
                        messagesDiv.innerHTML = '';
                        mensagens.forEach(msg => adicionarMensagem(msg, 'geral'));
                        messagesDiv.scrollTop = messagesDiv.scrollHeight;
                    });
            }

            function adicionarMensagem(msg, tipo) {
                const messagesDiv = tipo === 'geral' ? document.getElementById('chatMessagesGeral') : document.getElementById('chatMessagesPrivado');
                
                const existingMsg = document.getElementById(\`msg-\${msg.id}\`);
                if (existingMsg) {
                    existingMsg.remove();
                }
                
                const msgDiv = document.createElement('div');
                msgDiv.id = \`msg-\${msg.id}\`;
                msgDiv.className = \`message \${msg.remetente === usuarioAtual ? 'sent' : 'received'}\`;
                if (msg.deletada) {
                    msgDiv.classList.add('deleted');
                }
                
                const time = new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                
                let mensagemHtml = '';
                
                if (msg.deletada) {
                    mensagemHtml = \`
                        <div class="message-content">
                            <em>Mensagem deletada</em>
                        </div>
                        <div class="message-time">\${time}</div>
                    \`;
                } else {
                    const editIndicator = msg.editada ? '<span class="edited-indicator">(editada)</span>' : '';
                    
                    // Adicionar status online/offline apenas no chat geral
                    if (tipo === 'geral') {
                        // Para mensagens enviadas pelo próprio usuário, mostrar como online
                        const isOnline = (msg.remetente === usuarioAtual) ? true : (statusContatos[msg.remetente] !== undefined ? statusContatos[msg.remetente] : false);
                        const statusText = isOnline ? '🟢 Online' : '⚫ Offline';
                        mensagemHtml = \`
                            <div class="message-content" id="msg-content-\${msg.id}">
                                <strong>\${msg.remetente}:</strong> \${msg.mensagem} \${editIndicator}
                                <span style="font-size: 10px; opacity: 0.7; margin-left: 8px;">\${statusText}</span>
                            </div>
                            <div class="message-time">\${time}</div>
                        \`;
                    } else {
                        mensagemHtml = \`
                            <div class="message-content" id="msg-content-\${msg.id}">
                                \${msg.mensagem} \${editIndicator}
                            </div>
                            <div class="message-time">\${time}</div>
                        \`;
                    }
                    
                    if (msg.remetente === usuarioAtual) {
                        mensagemHtml += \`
                            <div class="message-options">
                                <button class="message-option-btn" onclick="editarMensagem(\${msg.id}, '\${tipo}')" title="Editar">✏️</button>
                                <button class="message-option-btn" onclick="deletarMensagem(\${msg.id}, '\${tipo}')" title="Deletar">🗑️</button>
                            </div>
                        \`;
                    }
                }
                
                msgDiv.innerHTML = mensagemHtml;
                messagesDiv.appendChild(msgDiv);
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }

            function adicionarMensagemPrivada(msg) {
                adicionarMensagem(msg, 'privado');
            }

            function editarMensagem(msgId, tipo) {
                if (mensagemEditando) {
                    cancelarEdicao(mensagemEditando);
                }
                
                const msgDiv = document.getElementById(\`msg-\${msgId}\`);
                const msgContent = document.getElementById(\`msg-content-\${msgId}\`);
                const mensagemAtual = msgContent.childNodes[0].nodeValue || msgContent.innerText;
                const textoLimpo = mensagemAtual.replace(/\\(editada\\)/g, '').trim();
                
                const editForm = document.createElement('div');
                editForm.className = 'edit-form';
                editForm.innerHTML = \`
                    <input type="text" id="edit-input-\${msgId}" class="edit-message-input" value="\${textoLimpo}">
                    <div class="edit-actions">
                        <button onclick="salvarEdicao(\${msgId}, '\${tipo}')">Salvar</button>
                        <button onclick="cancelarEdicao(\${msgId})">Cancelar</button>
                    </div>
                \`;
                
                msgContent.style.display = 'none';
                msgDiv.appendChild(editForm);
                mensagemEditando = msgId;
            }

            function salvarEdicao(msgId, tipo) {
                const novoTexto = document.getElementById(\`edit-input-\${msgId}\`).value.trim();
                
                if (!novoTexto) {
                    alert('A mensagem não pode estar vazia');
                    return;
                }
                
                fetch('/api/mensagem/editar', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        id: msgId,
                        mensagem: novoTexto,
                        tipo: tipo
                    })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        cancelarEdicao(msgId);
                    } else {
                        alert('Erro ao editar mensagem: ' + (data.error || 'Erro desconhecido'));
                    }
                })
                .catch(err => {
                    console.error('Erro:', err);
                    alert('Erro de conexão');
                });
            }

            function cancelarEdicao(msgId) {
                const msgDiv = document.getElementById(\`msg-\${msgId}\`);
                const msgContent = document.getElementById(\`msg-content-\${msgId}\`);
                const editForm = msgDiv.querySelector('.edit-form');
                
                if (editForm) {
                    editForm.remove();
                }
                if (msgContent) {
                    msgContent.style.display = 'block';
                }
                if (mensagemEditando === msgId) {
                    mensagemEditando = null;
                }
            }

            function deletarMensagem(msgId, tipo) {
                if (!confirm('Tem certeza que deseja deletar esta mensagem?')) {
                    return;
                }
                
                fetch('/api/mensagem/deletar', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        id: msgId,
                        tipo: tipo
                    })
                })
                .then(response => response.json())
                .then(data => {
                    if (!data.success) {
                        alert('Erro ao deletar mensagem: ' + (data.error || 'Erro desconhecido'));
                    }
                })
                .catch(err => {
                    console.error('Erro:', err);
                    alert('Erro de conexão');
                });
            }

            function atualizarMensagem(data) {
                const msgDiv = document.getElementById(\`msg-\${data.id}\`);
                if (msgDiv) {
                    const msgContent = document.getElementById(\`msg-content-\${data.id}\`);
                    if (msgContent) {
                        const editIndicator = data.editada ? '<span class="edited-indicator">(editada)</span>' : '';
                        let texto = '';
                        if (data.tipo === 'geral') {
                            const isOnline = (data.remetente === usuarioAtual) ? true : (statusContatos[data.remetente] !== undefined ? statusContatos[data.remetente] : false);
                            const statusText = isOnline ? '🟢 Online' : '⚫ Offline';
                            texto = \`<strong>\${data.remetente}:</strong> \${data.mensagem} \${editIndicator} <span style="font-size: 10px; opacity: 0.7; margin-left: 8px;">\${statusText}</span>\`;
                        } else {
                            texto = \`\${data.mensagem} \${editIndicator}\`;
                        }
                        msgContent.innerHTML = texto;
                    }
                }
            }

            function deletarMensagemUI(msgId, tipo) {
                const msgDiv = document.getElementById(\`msg-\${msgId}\`);
                if (msgDiv) {
                    msgDiv.classList.add('deleted');
                    const msgContent = document.getElementById(\`msg-content-\${msgId}\`);
                    if (msgContent) {
                        msgContent.innerHTML = '<em>Mensagem deletada</em>';
                    }
                    const msgOptions = msgDiv.querySelector('.message-options');
                    if (msgOptions) {
                        msgOptions.remove();
                    }
                }
            }

            function sendMessage(tipo) {
                const input = document.getElementById(\`chatInput\${tipo.charAt(0).toUpperCase() + tipo.slice(1)}\`);
                const mensagem = input.value.trim();
                
                if (!mensagem) return;
                
                const mensagemData = {
                    remetente: usuarioAtual,
                    turma: turmaAtual,
                    mensagem: mensagem,
                    tipo: tipo,
                    created_at: new Date()
                };
                
                if (tipo === 'privado') {
                    if (!conversaAtiva) {
                        alert('Selecione um contato para enviar mensagem privada');
                        return;
                    }
                    mensagemData.destinatario = conversaAtiva;
                }
                
                socket.emit('nova-mensagem', mensagemData);
                
                input.value = '';
                fecharTodosEmojis();
            }

            function handleKeyDown(event, tipo) {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage(tipo);
                } else {
                    if (tipo === 'geral') {
                        socket.emit('digitando', {
                            usuario: usuarioAtual,
                            turma: turmaAtual,
                            tipo: 'geral'
                        });
                    } else if (conversaAtiva) {
                        socket.emit('digitando', {
                            usuario: usuarioAtual,
                            destinatario: conversaAtiva,
                            tipo: 'privado'
                        });
                    }
                }
            }

            function atualizarStatusContato(usuario, online) {
                const contatos = document.querySelectorAll('.contact-item');
                contatos.forEach(contato => {
                    const nomeContato = contato.querySelector('.contact-name').childNodes[0].nodeValue.trim();
                    if (nomeContato === usuario) {
                        const statusDiv = contato.querySelector('.contact-status');
                        const indicator = contato.querySelector('.online-indicator');
                        
                        if (online) {
                            statusDiv.innerHTML = '🟢 Online';
                            indicator.className = 'online-indicator online';
                        } else {
                            statusDiv.innerHTML = '⚫ Offline';
                            indicator.className = 'online-indicator offline';
                        }
                    }
                });
            }

            function atualizarStatusNasMensagensGerais(usuario, online) {
                const statusText = online ? '🟢 Online' : '⚫ Offline';
                const mensagens = document.querySelectorAll('#chatMessagesGeral .message.received .message-content');
                mensagens.forEach(msgContent => {
                    const strongElement = msgContent.querySelector('strong');
                    if (strongElement && strongElement.textContent === usuario + ':') {
                        // Remover status antigo se existir
                        const oldStatus = msgContent.querySelector('span');
                        if (oldStatus) {
                            oldStatus.remove();
                        }
                        // Adicionar novo status
                        const statusSpan = document.createElement('span');
                        statusSpan.style.cssText = 'font-size: 10px; opacity: 0.7; margin-left: 8px;';
                        statusSpan.textContent = statusText;
                        msgContent.appendChild(statusSpan);
                    }
                });
            }

            let emojiPickerAberto = null;

            function fecharTodosEmojis() {
                if (document.getElementById('emojiPickerGeral')) {
                    document.getElementById('emojiPickerGeral').classList.add('hidden');
                }
                if (document.getElementById('emojiPickerPrivado')) {
                    document.getElementById('emojiPickerPrivado').classList.add('hidden');
                }
                emojiPickerAberto = null;
            }

            function toggleEmojiPicker(event, tipo) {
                event.stopPropagation();
                
                const pickerId = tipo === 'geral' ? 'emojiPickerGeral' : 'emojiPickerPrivado';
                const picker = document.getElementById(pickerId);
                
                if (emojiPickerAberto === pickerId) {
                    picker.classList.add('hidden');
                    emojiPickerAberto = null;
                } else {
                    if (emojiPickerAberto) {
                        document.getElementById(emojiPickerAberto).classList.add('hidden');
                    }
                    picker.classList.remove('hidden');
                    emojiPickerAberto = pickerId;
                }
            }

            function addEmoji(emoji, tipo) {
                const inputId = tipo === 'geral' ? 'chatInputGeral' : 'chatInputPrivado';
                const input = document.getElementById(inputId);
                input.value += emoji;
                input.focus();
                
                const pickerId = tipo === 'geral' ? 'emojiPickerGeral' : 'emojiPickerPrivado';
                document.getElementById(pickerId).classList.add('hidden');
                emojiPickerAberto = null;
            }

            document.addEventListener('click', function(event) {
                if (!event.target.closest('.emoji-picker-container')) {
                    fecharTodosEmojis();
                }
            });

            // ===== CÓDIGO DA RÁDIO COM FUNÇÃO DE RECOLHER =====
            const radio = document.getElementById('radioAudio');
            const playPauseBtn = document.getElementById('radioPlayPauseBtn');
            const radioStatus = document.getElementById('radioStatus');
            const radioVolume = document.getElementById('radioVolume');
            const radioVolumeDetail = document.getElementById('radioVolumeDetail');
            const volumeValue = document.getElementById('volumeValue');
            const muteBtn = document.getElementById('radioMuteBtn');
            const miniPlayer = document.getElementById('radioMiniPlayer');
            const radioSongTitle = document.getElementById('radioSongTitle');
            const radioSongArtist = document.getElementById('radioSongArtist');
            const tooltipSongTitle = document.getElementById('tooltipSongTitle');
            const tooltipSongArtist = document.getElementById('tooltipSongArtist');
            const radioToggleBtn = document.getElementById('radioToggleBtn');
            
            let isMuted = false;
            let previousVolume = 70;
            let isMinimized = false;

            // Função para recolher/esticar o player
            function toggleRadioPlayer() {
                isMinimized = !isMinimized;
                if (isMinimized) {
                    miniPlayer.classList.add('minimized');
                    radioToggleBtn.textContent = '➕';
                    radioToggleBtn.title = 'Expandir';
                } else {
                    miniPlayer.classList.remove('minimized');
                    radioToggleBtn.textContent = '➖';
                    radioToggleBtn.title = 'Recolher';
                }
                // Salvar estado no localStorage
                localStorage.setItem('radioMinimized', isMinimized);
            }

            // Carregar preferências salvas
            const savedVolume = localStorage.getItem('radioVolume');
            const savedPlaying = localStorage.getItem('radioPlaying');
            const savedMinimized = localStorage.getItem('radioMinimized');
            
            if (savedMinimized === 'true') {
                isMinimized = true;
                miniPlayer.classList.add('minimized');
                radioToggleBtn.textContent = '➕';
                radioToggleBtn.title = 'Expandir';
            } else {
                radioToggleBtn.textContent = '➖';
                radioToggleBtn.title = 'Recolher';
            }
            
            if (savedVolume) {
                radio.volume = savedVolume / 100;
                radioVolume.value = savedVolume;
                if (radioVolumeDetail) radioVolumeDetail.value = savedVolume;
                if (volumeValue) volumeValue.textContent = savedVolume + '%';
            }

            // Função para buscar música atual (simulada)
            function buscarMusicaAtual() {
                fetch('/api/radio/now-playing')
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            const titulo = data.musica || "Música Desconhecida";
                            const artista = data.artista || "Rádio Escola";
                            
                            // Atualizar elementos da interface
                            if (radioSongTitle) radioSongTitle.textContent = titulo;
                            if (radioSongArtist) radioSongArtist.textContent = artista;
                            if (tooltipSongTitle) tooltipSongTitle.textContent = titulo;
                            if (tooltipSongArtist) tooltipSongArtist.textContent = artista;
                        }
                    })
                    .catch(err => console.error('Erro ao buscar música:', err));
            }

            // Buscar música a cada 15 segundos
            setInterval(buscarMusicaAtual, 15000);
            // Buscar imediatamente
            buscarMusicaAtual();

            function playRadio() {
                radio.play()
                    .then(() => {
                        playPauseBtn.textContent = '⏸️';
                        if (radioStatus) radioStatus.textContent = 'Tocando';
                        miniPlayer.classList.add('playing');
                        localStorage.setItem('radioPlaying', 'true');
                        buscarMusicaAtual();
                    })
                    .catch(err => {
                        console.error('Erro ao tocar rádio:', err);
                        if (radioStatus) radioStatus.textContent = 'Erro';
                    });
            }

            function pauseRadio() {
                radio.pause();
                playPauseBtn.textContent = '▶️';
                if (radioStatus) radioStatus.textContent = 'Pausado';
                miniPlayer.classList.remove('playing');
                localStorage.setItem('radioPlaying', 'false');
            }

            function stopRadio() {
                radio.pause();
                radio.currentTime = 0;
                playPauseBtn.textContent = '▶️';
                if (radioStatus) radioStatus.textContent = 'Parado';
                miniPlayer.classList.remove('playing');
                localStorage.setItem('radioPlaying', 'false');
            }

            function toggleRadio() {
                if (radio.paused) {
                    playRadio();
                } else {
                    pauseRadio();
                }
            }

            function changeRadioVolume(value) {
                radio.volume = value / 100;
                radioVolume.value = value;
                if (radioVolumeDetail) radioVolumeDetail.value = value;
                if (volumeValue) volumeValue.textContent = value + '%';
                localStorage.setItem('radioVolume', value);
                
                // Atualizar ícone do mute
                if (value == 0) {
                    muteBtn.textContent = '🔇';
                } else {
                    muteBtn.textContent = isMuted ? '🔇' : '🔊';
                }
            }

            function changeRadioVolumeDetail(value) {
                changeRadioVolume(value);
            }

            function toggleMute() {
                if (isMuted) {
                    radio.volume = previousVolume / 100;
                    radioVolume.value = previousVolume;
                    if (radioVolumeDetail) radioVolumeDetail.value = previousVolume;
                    if (volumeValue) volumeValue.textContent = previousVolume + '%';
                    muteBtn.textContent = '🔊';
                } else {
                    previousVolume = radio.volume * 100;
                    radio.volume = 0;
                    radioVolume.value = 0;
                    if (radioVolumeDetail) radioVolumeDetail.value = 0;
                    if (volumeValue) volumeValue.textContent = '0%';
                    muteBtn.textContent = '🔇';
                }
                isMuted = !isMuted;
            }

            // Event listeners da rádio
            radio.addEventListener('play', () => {
                console.log('Rádio tocando');
            });

            radio.addEventListener('pause', () => {
                console.log('Rádio pausada');
            });

            radio.addEventListener('error', (e) => {
                console.error('Erro na rádio:', e);
                if (radioStatus) radioStatus.textContent = 'Erro';
            });

            // Auto-play se estava tocando antes
            if (savedPlaying === 'true') {
                setTimeout(() => {
                    playRadio();
                }, 1000);
            }

            // Sincronizar os controles de volume
            if (radioVolumeDetail) {
                radioVolumeDetail.addEventListener('input', (e) => {
                    changeRadioVolume(e.target.value);
                });
            }

            radioVolume.addEventListener('input', (e) => {
                changeRadioVolume(e.target.value);
            });

            window.onload = function() {
                fecharTodosEmojis();
            };
        }
    </script>
</body>
</html>
    `;
}

// ===== ROTAS =====

app.get("/", (req, res) => {
    if (req.session.user) {
        db.query(
            "SELECT cargo, turma FROM usuarios WHERE user=?",
            [req.session.user],
            (err, result) => {
                if (err) {
                    console.log(err);
                    return res.send(layout("Erro", "<h2>Erro ao carregar dados</h2>", req.session.user));
                }
                
                if (result && result.length > 0) {
                    const userCargo = result[0].cargo;
                    const userTurma = result[0].turma;
                    
                    if (userCargo && userCargo.includes('Aluno')) {
                        return res.redirect(`/turma/${userTurma}`);
                    }
                    
                    res.send(layout("Início", paginaInicial(req.session.user, userCargo), req.session.user, userCargo, userTurma));
                } else {
                    res.send(layout("Início", paginaInicial(), req.session.user));
                }
            }
        );
    } else {
        res.send(layout("Início", paginaInicial(), req.session.user));
    }
});

function paginaInicial(user, cargo = null) {
    if (user) {
        if (cargo && (cargo.includes('Diretor') || cargo.includes('Coordenador') || cargo.includes('Professor'))) {
            return `
            <h2>🎓 Bem-vindo ao Portal Escolar</h2>
            <p style="text-align: center; font-size: 1.2em; margin-bottom: 30px;">Você está logado como: <strong>${user}</strong> (${cargo})</p>
            <p style="text-align: center; color: #666; margin-bottom: 20px;">Escolha uma turma para acessar o feed:</p>
            
            <div class="turmas-grid">
                <a href="/turma/1A" style="text-decoration: none;">
                    <div class="turma-card">
                        <h3>1º Ano A</h3>
                        <p>Acessar feed da turma</p>
                    </div>
                </a>
                <a href="/turma/2A" style="text-decoration: none;">
                    <div class="turma-card">
                        <h3>2º Ano A</h3>
                        <p>Acessar feed da turma</p>
                    </div>
                </a>
                <a href="/turma/3A" style="text-decoration: none;">
                    <div class="turma-card">
                        <h3>3º Ano A</h3>
                        <p>Acessar feed da turma</p>
                    </div>
                </a>
            </div>
            `;
        } else {
            return `
            <h2>🎓 Bem-vindo ao Portal Escolar</h2>
            <p style="text-align: center; font-size: 1.2em;">Você está logado como: <strong>${user}</strong> (${cargo})</p>
            <p style="text-align: center; color: #666;">Use o menu ao lado para navegar pelo sistema.</p>
            `;
        }
    } else {
        return `
        <h2>🔐 Login</h2>
        
        <div style="background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto;">
            <form method="post" action="/login">
                <div class="form-group">
                    <label style="font-weight: 600; color: #004080;">Usuário:</label>
                    <input type="text" name="user" placeholder="Digite seu usuário" required>
                </div>
                <div class="form-group">
                    <label style="font-weight: 600; color: #004080;">Senha:</label>
                    <input type="password" name="pass" placeholder="Digite sua senha" required>
                </div>
                <button type="submit" style="width: 100%; padding: 12px; font-size: 16px;">Entrar</button>
            </form>
            
            <p style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 2px solid #f0f0f0;">
                <a href="/esqueci-senha" style="color: #0073e6; font-weight: 600;">Esqueci minha senha</a>
            </p>
            
            <p style="text-align: center; margin-top: 10px;">
                Não tem uma conta? <a href="/registro" style="color: #0073e6; font-weight: 600;">Registre-se aqui</a>
            </p>
        </div>
        `;
    }
}

app.get("/registro", (req, res) => {
    res.send(layout("Registro", `
    <h2>📝 Registro de Usuário</h2>
    
    <div style="background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto;">
        <form method="post" action="/registro" id="registroForm">
            <div class="form-group">
                <label style="font-weight: 600; color: #004080;">Nome de usuário:</label>
                <input type="text" name="user" placeholder="Escolha um nome de usuário" required>
            </div>
            
            <div class="form-group">
                <label style="font-weight: 600; color: #004080;">Senha:</label>
                <input type="password" name="pass" placeholder="Crie uma senha" required>
            </div>
            
            <div class="form-group">
                <label style="font-weight: 600; color: #004080;">Email:</label>
                <input type="email" name="email" placeholder="Digite seu email" required>
            </div>
            
            <div class="form-group">
                <label style="font-weight: 600; color: #004080;">Tipo de usuário:</label>
                <select name="tipo" id="tipoSelect" required onchange="mostrarCamposAdicionais()">
                    <option value="">Selecione...</option>
                    <option value="Aluno">Aluno</option>
                    <option value="Professor">Professor</option>
                    <option value="Professor Apoio">Professor de Apoio</option>
                    <option value="Diretor">Diretor</option>
                    <option value="Vice Diretor">Vice Diretor(a)</option>
                    <option value="Coordenador">Coordenador</option>
                    <option value="Agente Merenda">Agente de Merenda</option>
                    <option value="Profissional Limpeza">Profissional da Limpeza</option>
                    <option value="Cuidador Patio">Cuidador do Pátio/Manutenção</option>
                </select>
            </div>
            
            <div class="form-group" id="turmaDiv" style="display:none;">
                <label style="font-weight: 600; color: #004080;">Turma:</label>
                <select name="turma">
                    <option value="">Selecione...</option>
                    <option value="1A">1º Ano A</option>
                    <option value="2A">2º Ano A</option>
                    <option value="3A">3º Ano A</option>
                </select>
            </div>
            
            <div class="form-group">
                <label style="font-weight: 600; color: #004080;">Senha de acesso (fornecida pela escola):</label>
                <input type="password" name="senha_acesso" placeholder="Digite a senha de acesso" required>
            </div>
            
            <button type="submit" style="width: 100%; padding: 12px; font-size: 16px;">Registrar</button>
        </form>
        
        <p style="text-align: center; margin-top: 20px;">
            <a href="/">← Voltar para o login</a>
        </p>
    </div>
    
    <script>
    function mostrarCamposAdicionais() {
        var tipo = document.getElementById('tipoSelect').value;
        var turmaDiv = document.getElementById('turmaDiv');
        
        if(tipo === 'Aluno') {
            turmaDiv.style.display = 'block';
        } else {
            turmaDiv.style.display = 'none';
        }
    }
    </script>
    `, req.session.user));
});

app.post("/registro", (req, res) => {
    const { user, pass, tipo, turma, senha_acesso, email } = req.body;
    
    db.query(
        "SELECT * FROM usuarios WHERE user=?",
        [user],
        (err, result) => {
            if (err) {
                console.log(err);
                return res.send(layout("Erro", `
                <h2>Erro no registro</h2>
                <div class="alert alert-error">Erro ao verificar usuário.</div>
                <p><a href="/registro">Voltar ao registro</a></p>
                `, req.session.user));
            }
            
            if (result && result.length > 0) {
                return res.send(layout("Erro", `
                <h2>Erro no registro</h2>
                <div class="alert alert-error">Nome de usuário já existe. Escolha outro nome.</div>
                <p><a href="/registro">Voltar ao registro</a></p>
                `, req.session.user));
            }
            
            let chaveSenha;
            if (tipo === 'Aluno') {
                if (!turma) {
                    return res.send(layout("Erro", `
                    <h2>Erro no registro</h2>
                    <div class="alert alert-error">Selecione uma turma para o aluno.</div>
                    <p><a href="/registro">Voltar ao registro</a></p>
                    `, req.session.user));
                }
                chaveSenha = `Aluno_${turma}`;
            } else {
                chaveSenha = tipo;
            }
            
            if (senhasCargo[chaveSenha] !== senha_acesso) {
                return res.send(layout("Erro", `
                <h2>Erro no registro</h2>
                <div class="alert alert-error">Senha de acesso incorreta para este cargo/turma.</div>
                <p><a href="/registro">Voltar ao registro</a></p>
                `, req.session.user));
            }
            
            const cargo_completo = tipo === 'Aluno' ? `Aluno - ${turma}` : tipo;
            
            db.query(
                "INSERT INTO usuarios (user, pass, cargo, turma, email) VALUES (?, ?, ?, ?, ?)",
                [user, pass, cargo_completo, turma || null, email],
                (err, result) => {
                    if (err) {
                        console.log(err);
                        return res.send(layout("Erro", `
                        <h2>Erro no registro</h2>
                        <div class="alert alert-error">Erro ao registrar: ${err.message}</div>
                        <p><a href="/registro">Voltar ao registro</a></p>
                        `, req.session.user));
                    }
                    
                    req.session.user = user;
                    res.redirect("/");
                }
            );
        }
    );
});

// ===== ROTA PARA PERFIL =====

app.get("/perfil", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    db.query(
        "SELECT * FROM usuarios WHERE user=?",
        [req.session.user],
        (err, result) => {
            if (err || !result || result.length === 0) {
                return res.redirect("/");
            }
            
            const user = result[0];
            
            db.query(
                "SELECT COUNT(*) as total FROM posts WHERE user=?",
                [req.session.user],
                (err, postsResult) => {
                    const totalPosts = (postsResult && postsResult[0]) ? postsResult[0].total : 0;
                    
                    db.query(
                        `SELECT 
                            (SELECT COUNT(*) FROM likes WHERE post_id IN (SELECT id FROM posts WHERE user=?)) +
                            (SELECT COUNT(*) FROM likes WHERE boletim_id IN (SELECT id FROM boletins_posts WHERE user=?)) +
                            (SELECT COUNT(*) FROM likes WHERE recado_id IN (SELECT id FROM recados_posts WHERE user=?)) +
                            (SELECT COUNT(*) FROM likes WHERE cardapio_id IN (SELECT id FROM cardapio_posts WHERE user=?)) +
                            (SELECT COUNT(*) FROM likes WHERE limpeza_id IN (SELECT id FROM limpeza_posts WHERE user=?)) +
                            (SELECT COUNT(*) FROM likes WHERE patio_id IN (SELECT id FROM patio_posts WHERE user=?)) as total`,
                        [req.session.user, req.session.user, req.session.user, req.session.user, req.session.user, req.session.user],
                        (err, likesResult) => {
                            const totalLikes = (likesResult && likesResult[0]) ? likesResult[0].total || 0 : 0;
                            
                            let fotoHtml = '';
                            if (user.foto && fs.existsSync(path.join(__dirname, 'fotos_perfil', user.foto))) {
                                fotoHtml = `<img src="/fotos_perfil/${user.foto}" alt="Foto de perfil">`;
                            } else {
                                fotoHtml = user.user.charAt(0).toUpperCase();
                            }
                            
                            const conteudo = `
                            <div class="profile-container">
                                <div class="profile-header">
                                    <div class="profile-avatar">
                                        ${fotoHtml}
                                    </div>
                                    <div class="profile-info">
                                        <div class="profile-name">${user.user}</div>
                                        <div class="profile-cargo">${user.cargo || 'Usuário'} ${user.turma ? `- Turma ${user.turma}` : ''}</div>
                                        <div class="profile-stats">
                                            <div class="stat-item">
                                                <div class="stat-value">${totalPosts}</div>
                                                <div class="stat-label">Posts</div>
                                            </div>
                                            <div class="stat-item">
                                                <div class="stat-value">${totalLikes}</div>
                                                <div class="stat-label">Likes</div>
                                            </div>
                                            <div class="stat-item">
                                                <div class="stat-value">${new Date(user.created_at).toLocaleDateString()}</div>
                                                <div class="stat-label">Membro desde</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div id="profile-details">
                                    <div class="profile-details">
                                        <div class="detail-item">
                                            <div class="detail-label">📧 Email</div>
                                            <div class="detail-value">${user.email || 'Não informado'}</div>
                                        </div>
                                        <div class="detail-item">
                                            <div class="detail-label">📞 Telefone</div>
                                            <div class="detail-value">${user.telefone || 'Não informado'}</div>
                                        </div>
                                        <div class="detail-item">
                                            <div class="detail-label">📍 Endereço</div>
                                            <div class="detail-value">${user.endereco || 'Não informado'}</div>
                                        </div>
                                        <div class="detail-item">
                                            <div class="detail-label">👨 Nome do Pai</div>
                                            <div class="detail-value">${user.nome_pai || 'Não informado'}</div>
                                        </div>
                                        <div class="detail-item">
                                            <div class="detail-label">👩 Nome da Mãe</div>
                                            <div class="detail-value">${user.nome_mae || 'Não informado'}</div>
                                        </div>
                                        <div class="detail-item">
                                            <div class="detail-label">🕒 Última vez online</div>
                                            <div class="detail-value">${user.ultima_vez ? new Date(user.ultima_vez).toLocaleString() : 'Nunca'}</div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="profile-actions">
                                    <button onclick="mostrarEditarPerfil()">✏️ Editar Perfil</button>
                                    <button onclick="mostrarAlterarSenha()">🔑 Alterar Senha</button>
                                </div>
                                
                                <div id="edit-profile-form" class="edit-profile-form hidden">
                                    <h3 style="margin-bottom: 20px;">Editar Perfil</h3>
                                    <form method="post" action="/atualizar-perfil" enctype="multipart/form-data">
                                        <div class="form-group">
                                            <label>📧 Email:</label>
                                            <input type="email" name="email" value="${user.email || ''}" placeholder="Digite seu email">
                                        </div>
                                        <div class="form-group">
                                            <label>📞 Telefone:</label>
                                            <input type="text" name="telefone" value="${user.telefone || ''}" placeholder="Digite seu telefone">
                                        </div>
                                        <div class="form-group">
                                            <label>📍 Endereço:</label>
                                            <textarea name="endereco" rows="3" placeholder="Digite seu endereço">${user.endereco || ''}</textarea>
                                        </div>
                                        <div class="form-group">
                                            <label>👨 Nome do Pai:</label>
                                            <input type="text" name="nome_pai" value="${user.nome_pai || ''}" placeholder="Digite o nome do pai">
                                        </div>
                                        <div class="form-group">
                                            <label>👩 Nome da Mãe:</label>
                                            <input type="text" name="nome_mae" value="${user.nome_mae || ''}" placeholder="Digite o nome da mãe">
                                        </div>
                                        <div class="form-group">
                                            <label>📸 Foto de perfil:</label>
                                            <input type="file" name="foto" accept="image/*">
                                            <small style="color: #666;">Formatos aceitos: JPG, PNG, GIF</small>
                                        </div>
                                        <div style="display: flex; gap: 10px;">
                                            <button type="submit">Salvar</button>
                                            <button type="button" onclick="cancelarEditarPerfil()" style="background: #666;">Cancelar</button>
                                        </div>
                                    </form>
                                </div>
                                
                                <div id="alterar-senha-form" class="edit-profile-form hidden">
                                    <h3 style="margin-bottom: 20px;">Alterar Senha</h3>
                                    <form method="post" action="/alterar-senha">
                                        <div class="form-group">
                                            <label>🔑 Senha atual:</label>
                                            <input type="password" name="senha_atual" required>
                                        </div>
                                        <div class="form-group">
                                            <label>🔑 Nova senha:</label>
                                            <input type="password" name="nova_senha" required>
                                        </div>
                                        <div class="form-group">
                                            <label>🔑 Confirmar nova senha:</label>
                                            <input type="password" name="confirmar_senha" required>
                                        </div>
                                        <div style="display: flex; gap: 10px;">
                                            <button type="submit">Alterar Senha</button>
                                            <button type="button" onclick="cancelarAlterarSenha()" style="background: #666;">Cancelar</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                            
                            <script>
                                function mostrarEditarPerfil() {
                                    document.getElementById('profile-details').classList.add('hidden');
                                    document.getElementById('edit-profile-form').classList.remove('hidden');
                                    document.getElementById('alterar-senha-form').classList.add('hidden');
                                }
                                
                                function cancelarEditarPerfil() {
                                    document.getElementById('profile-details').classList.remove('hidden');
                                    document.getElementById('edit-profile-form').classList.add('hidden');
                                }
                                
                                function mostrarAlterarSenha() {
                                    document.getElementById('profile-details').classList.add('hidden');
                                    document.getElementById('alterar-senha-form').classList.remove('hidden');
                                    document.getElementById('edit-profile-form').classList.add('hidden');
                                }
                                
                                function cancelarAlterarSenha() {
                                    document.getElementById('profile-details').classList.remove('hidden');
                                    document.getElementById('alterar-senha-form').classList.add('hidden');
                                }
                            </script>
                            `;
                            
                            let mensagem = '';
                            if (req.query.sucesso === 'perfil_atualizado') {
                                mensagem = '<div class="alert alert-success">✅ Perfil atualizado com sucesso!</div>';
                            } else if (req.query.sucesso === 'senha_alterada') {
                                mensagem = '<div class="alert alert-success">✅ Senha alterada com sucesso!</div>';
                            } else if (req.query.erro === 'senha_incorreta') {
                                mensagem = '<div class="alert alert-error">❌ Senha atual incorreta!</div>';
                            } else if (req.query.erro === 'senhas_diferentes') {
                                mensagem = '<div class="alert alert-error">❌ As senhas não conferem!</div>';
                            } else if (req.query.erro === 'banco') {
                                mensagem = '<div class="alert alert-error">❌ Erro ao atualizar!</div>';
                            }
                            
                            res.send(layout("Meu Perfil", mensagem + conteudo, req.session.user, user.cargo, user.turma));
                        }
                    );
                }
            );
        }
    );
});

// ===== ROTA PARA ATUALIZAR PERFIL =====

app.post("/atualizar-perfil", upload.single('foto'), (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    const { email, telefone, endereco, nome_pai, nome_mae } = req.body;
    const foto = req.file ? req.file.filename : null;
    
    let query = "UPDATE usuarios SET email = ?, telefone = ?, endereco = ?, nome_pai = ?, nome_mae = ?";
    let valores = [email || null, telefone || null, endereco || null, nome_pai || null, nome_mae || null];
    
    if (foto) {
        query += ", foto = ?";
        valores.push(foto);
    }
    
    query += " WHERE user = ?";
    valores.push(req.session.user);
    
    db.query(query, valores, (err, result) => {
        if (err) {
            console.log("❌ Erro ao atualizar perfil:", err);
            return res.redirect("/perfil?erro=banco");
        }
        
        res.redirect("/perfil?sucesso=perfil_atualizado");
    });
});

// ===== ROTA PARA ALTERAR SENHA =====

app.post("/alterar-senha", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    const { senha_atual, nova_senha, confirmar_senha } = req.body;
    
    if (nova_senha !== confirmar_senha) {
        return res.redirect("/perfil?erro=senhas_diferentes");
    }
    
    db.query(
        "SELECT * FROM usuarios WHERE user = ? AND pass = ?",
        [req.session.user, senha_atual],
        (err, result) => {
            if (err) {
                console.log(err);
                return res.redirect("/perfil?erro=banco");
            }
            
            if (!result || result.length === 0) {
                return res.redirect("/perfil?erro=senha_incorreta");
            }
            
            db.query(
                "UPDATE usuarios SET pass = ? WHERE user = ?",
                [nova_senha, req.session.user],
                (err, result) => {
                    if (err) {
                        console.log(err);
                        return res.redirect("/perfil?erro=banco");
                    }
                    
                    res.redirect("/perfil?sucesso=senha_alterada");
                }
            );
        }
    );
});

// ===== ROTA PARA ESQUECI SENHA =====

app.get("/esqueci-senha", (req, res) => {
    res.send(layout("Esqueci minha senha", `
    <div class="feed-container">
        <h2>🔐 Recuperar Senha</h2>
        
        <div style="background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto;">
            <p style="text-align: center; color: #666; margin-bottom: 20px;">Digite seu email para receber instruções de recuperação de senha.</p>
            
            <form method="post" action="/esqueci-senha">
                <div class="form-group">
                    <label style="font-weight: 600; color: #004080;">📧 Email:</label>
                    <input type="email" name="email" placeholder="Digite seu email" required>
                </div>
                <button type="submit" style="width: 100%; padding: 12px; font-size: 16px;">Enviar</button>
            </form>
            
            <p style="text-align: center; margin-top: 20px;">
                <a href="/">← Voltar para o login</a>
            </p>
        </div>
    </div>
    `, req.session.user));
});

app.post("/esqueci-senha", (req, res) => {
    const { email } = req.body;
    
    db.query(
        "SELECT * FROM usuarios WHERE email = ?",
        [email],
        (err, result) => {
            if (err) {
                console.log(err);
                return res.send(layout("Erro", `
                <div class="feed-container">
                    <h2>Erro</h2>
                    <div class="alert alert-error">Erro ao processar solicitação.</div>
                    <p><a href="/esqueci-senha">Voltar</a></p>
                </div>
                `, req.session.user));
            }
            
            if (!result || result.length === 0) {
                return res.send(layout("Email não encontrado", `
                <div class="feed-container">
                    <h2>Email não encontrado</h2>
                    <div class="alert alert-error">Este email não está cadastrado em nosso sistema.</div>
                    <p><a href="/esqueci-senha">Tentar novamente</a></p>
                    <p><a href="/">Voltar ao login</a></p>
                </div>
                `, req.session.user));
            }
            
            const token = crypto.randomBytes(32).toString('hex');
            const expira = new Date();
            expira.setHours(expira.getHours() + 1);
            
            db.query(
                "UPDATE usuarios SET reset_token = ?, reset_expira = ? WHERE email = ?",
                [token, expira, email],
                (err) => {
                    if (err) {
                        console.log(err);
                        return res.send(layout("Erro", `
                        <div class="feed-container">
                            <h2>Erro</h2>
                            <div class="alert alert-error">Erro ao gerar token de recuperação.</div>
                            <p><a href="/esqueci-senha">Voltar</a></p>
                        </div>
                        `, req.session.user));
                    }
                    
                    const link = `http://localhost:3000/redefinir-senha/${token}`;
                    
                    res.send(layout("Email enviado", `
                    <div class="feed-container">
                        <h2>📧 Email enviado!</h2>
                        <div class="alert alert-success">
                            <p>Enviamos um email com instruções para recuperar sua senha.</p>
                            <p style="margin-top: 10px; font-size: 12px; color: #666;">(Ambiente de teste - Link de recuperação: <a href="${link}">${link}</a>)</p>
                        </div>
                        <p><a href="/">Voltar ao login</a></p>
                    </div>
                    `, req.session.user));
                }
            );
        }
    );
});

// ===== ROTA PARA REDEFINIR SENHA =====

app.get("/redefinir-senha/:token", (req, res) => {
    const token = req.params.token;
    
    db.query(
        "SELECT * FROM usuarios WHERE reset_token = ? AND reset_expira > NOW()",
        [token],
        (err, result) => {
            if (err) {
                console.log(err);
                return res.send(layout("Erro", `
                <div class="feed-container">
                    <h2>Erro</h2>
                    <div class="alert alert-error">Erro ao verificar token.</div>
                    <p><a href="/esqueci-senha">Solicitar novo link</a></p>
                </div>
                `, req.session.user));
            }
            
            if (!result || result.length === 0) {
                return res.send(layout("Token inválido", `
                <div class="feed-container">
                    <h2>Token inválido ou expirado</h2>
                    <div class="alert alert-error">O link de recuperação é inválido ou expirou.</div>
                    <p><a href="/esqueci-senha">Solicitar novo link</a></p>
                </div>
                `, req.session.user));
            }
            
            const usuario = result[0];
            
            res.send(layout("Redefinir senha", `
            <div class="feed-container">
                <h2>🔐 Redefinir senha</h2>
                
                <div style="background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto;">
                    <p style="text-align: center; color: #666; margin-bottom: 20px;">Digite sua nova senha para o usuário <strong>${usuario.user}</strong>.</p>
                    
                    <form method="post" action="/redefinir-senha/${token}">
                        <div class="form-group">
                            <label style="font-weight: 600; color: #004080;">🔑 Nova senha:</label>
                            <input type="password" name="nova_senha" required>
                        </div>
                        <div class="form-group">
                            <label style="font-weight: 600; color: #004080;">🔑 Confirmar nova senha:</label>
                            <input type="password" name="confirmar_senha" required>
                        </div>
                        <button type="submit" style="width: 100%; padding: 12px; font-size: 16px;">Redefinir senha</button>
                    </form>
                    
                    <p style="text-align: center; margin-top: 20px;">
                        <a href="/">← Voltar para o login</a>
                    </p>
                </div>
            </div>
            `, req.session.user));
        }
    );
});

app.post("/redefinir-senha/:token", (req, res) => {
    const token = req.params.token;
    const { nova_senha, confirmar_senha } = req.body;
    
    if (nova_senha !== confirmar_senha) {
        return res.redirect(`/redefinir-senha/${token}?erro=senhas_diferentes`);
    }
    
    db.query(
        "SELECT * FROM usuarios WHERE reset_token = ? AND reset_expira > NOW()",
        [token],
        (err, result) => {
            if (err) {
                console.log(err);
                return res.send(layout("Erro", `
                <div class="feed-container">
                    <h2>Erro</h2>
                    <div class="alert alert-error">Erro ao verificar token.</div>
                    <p><a href="/esqueci-senha">Solicitar novo link</a></p>
                </div>
                `, req.session.user));
            }
            
            if (!result || result.length === 0) {
                return res.send(layout("Token inválido", `
                <div class="feed-container">
                    <h2>Token inválido ou expirado</h2>
                    <div class="alert alert-error">O link de recuperação é inválido ou expirou.</div>
                    <p><a href="/esqueci-senha">Solicitar novo link</a></p>
                </div>
                `, req.session.user));
            }
            
            const usuario = result[0];
            
            db.query(
                "UPDATE usuarios SET pass = ?, reset_token = NULL, reset_expira = NULL WHERE id = ?",
                [nova_senha, usuario.id],
                (err) => {
                    if (err) {
                        console.log(err);
                        return res.send(layout("Erro", `
                        <div class="feed-container">
                            <h2>Erro</h2>
                            <div class="alert alert-error">Erro ao redefinir senha.</div>
                            <p><a href="/esqueci-senha">Tentar novamente</a></p>
                        </div>
                        `, req.session.user));
                    }
                    
                    res.send(layout("Senha redefinida", `
                    <div class="feed-container">
                        <h2>✅ Senha redefinida!</h2>
                        <div class="alert alert-success">
                            Sua senha foi redefinida com sucesso. Agora você pode fazer login com sua nova senha.
                        </div>
                        <p style="text-align: center;"><a href="/" style="background: #0073e6; color: white; padding: 10px 20px; border-radius: 25px; text-decoration: none;">Ir para o login</a></p>
                    </div>
                    `, req.session.user));
                }
            );
        }
    );
});

app.post("/login", (req, res) => {
    const { user, pass } = req.body;
    
    db.query(
        "SELECT * FROM usuarios WHERE user=? AND pass=?",
        [user, pass],
        (err, result) => {
            if (err) {
                console.log(err);
                return res.send(layout("Erro", `
                <h2>Erro no login</h2>
                <div class="alert alert-error">Erro ao fazer login.</div>
                <p><a href="/">Voltar ao login</a></p>
                `));
            }
            
            if (result && result.length > 0) {
                req.session.user = user;
                
                const cargo = result[0].cargo;
                const turma = result[0].turma;
                
                db.query(
                    "UPDATE usuarios SET online = TRUE, ultima_vez = NOW() WHERE user = ?",
                    [user]
                );
                
                if (cargo && cargo.includes('Aluno') && turma) {
                    res.redirect(`/turma/${turma}`);
                } else {
                    res.redirect("/");
                }
            } else {
                res.send(layout("Erro", `
                <h2>Erro no login</h2>
                <div class="alert alert-error">Usuário ou senha incorretos.</div>
                <p><a href="/">Voltar ao login</a></p>
                `));
            }
        }
    );
});

app.get("/logout", (req, res) => {
    if (req.session.user) {
        db.query(
            "UPDATE usuarios SET online = FALSE, ultima_vez = NOW() WHERE user = ?",
            [req.session.user]
        );
    }
    
    req.session.destroy(() => {
        res.redirect("/");
    });
});

// ===== ROTA PRINCIPAL DO CARDÁPIO =====

app.get("/cardapio", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    db.query(
        "SELECT cargo FROM usuarios WHERE user=?",
        [req.session.user],
        (err, userResult) => {
            if (err || !userResult || userResult.length === 0) {
                return res.redirect("/");
            }
            
            const userCargo = userResult[0].cargo;
            
            const conteudo = `
            <div class="feed-container">
                <h2>🍽️ Cardápio Semanal por Turno</h2>
                <p style="text-align: center; color: #666; margin-bottom: 30px;">Selecione um turno para ver o cardápio:</p>
                
                <div class="turmas-grid">
                    <a href="/cardapio/matutino" style="text-decoration: none;">
                        <div class="turma-card" style="background: #fff9e6;">
                            <h3>🌅 Matutino</h3>
                            <p>Manhã</p>
                            <p style="color: #666; font-size: 0.9em;">Café da manhã e almoço</p>
                        </div>
                    </a>
                    <a href="/cardapio/vespertino" style="text-decoration: none;">
                        <div class="turma-card" style="background: #fff0d9;">
                            <h3>☀️ Vespertino</h3>
                            <p>Tarde</p>
                            <p style="color: #666; font-size: 0.9em;">Almoço e lanche da tarde</p>
                        </div>
                    </a>
                    <a href="/cardapio/noturno" style="text-decoration: none;">
                        <div class="turma-card" style="background: #e6f0ff;">
                            <h3>🌙 Noturno</h3>
                            <p>Noite</p>
                            <p style="color: #666; font-size: 0.9em;">Jantar</p>
                        </div>
                    </a>
                </div>
            </div>
            `;
            
            res.send(layout("Cardápio Semanal", conteudo, req.session.user, userCargo));
        }
    );
});

// ===== ROTA DO CARDÁPIO POR TURNO =====

app.get("/cardapio/:turno", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    const turno = req.params.turno;
    
    if (!['matutino', 'vespertino', 'noturno'].includes(turno)) {
        return res.redirect("/cardapio");
    }
    
    const nomesTurno = {
        'matutino': '🌅 Matutino',
        'vespertino': '☀️ Vespertino',
        'noturno': '🌙 Noturno'
    };
    
    db.query(
        "SELECT cargo FROM usuarios WHERE user=?",
        [req.session.user],
        (err, userResult) => {
            if (err || !userResult || userResult.length === 0) {
                return res.redirect("/");
            }
            
            const userCargo = userResult[0].cargo;
            
            let mensagem = '';
            if (req.query.erro) {
                if (req.query.erro === 'arquivo_vazio') {
                    mensagem = '<div class="alert alert-error">❌ Selecione um arquivo para publicar!</div>';
                } else if (req.query.erro === 'texto_vazio') {
                    mensagem = '<div class="alert alert-error">❌ Escreva algo para publicar!</div>';
                } else if (req.query.erro === 'titulo_vazio') {
                    mensagem = '<div class="alert alert-error">❌ Digite um título para o cardápio!</div>';
                } else if (req.query.erro === 'banco') {
                    mensagem = '<div class="alert alert-error">❌ Erro ao salvar no banco de dados!</div>';
                } else if (req.query.erro === 'pdf_invalido') {
                    mensagem = '<div class="alert alert-error">❌ Arquivo inválido! Selecione apenas PDFs.</div>';
                }
            } else if (req.query.sucesso === 'post_criado') {
                mensagem = '<div class="alert alert-success">✅ Cardápio publicado com sucesso!</div>';
            }
            
            db.query(
                `SELECT c.*, u.cargo as autor_cargo 
                 FROM cardapio_posts c
                 JOIN usuarios u ON c.user = u.user
                 WHERE c.turno = ?
                 ORDER BY c.created_at DESC`,
                [turno],
                (err, posts) => {
                    if (err) {
                        console.log("Erro ao carregar cardápio:", err);
                        return res.send(layout("Erro", `
                        <div class="feed-container">
                            <h2>Erro ao carregar cardápio</h2>
                            <div class="alert alert-error">
                                Ocorreu um erro ao carregar o cardápio. Tente novamente mais tarde.
                            </div>
                            <a href="/cardapio" style="background: #666; color: white; padding: 8px 15px; border-radius: 20px; text-decoration: none; display: inline-block; margin-top: 20px;">← Voltar aos turnos</a>
                        </div>
                        `, req.session.user, userCargo));
                    }
                    
                    let postsHtml = '';
                    
                    if (posts && posts.length > 0) {
                        for (let post of posts) {
                            postsHtml += gerarPostCardapioHtml(post, req.session.user, userCargo);
                        }
                    } else {
                        postsHtml = '<p style="text-align: center; color: #666; padding: 40px;">Nenhum cardápio publicado para este turno ainda.</p>';
                    }
                    
                    const podePublicar = userCargo && userCargo.includes('Agente Merenda');
                    
                    let formularioPublicacao = '';
                    
                    if (podePublicar) {
                        formularioPublicacao = `
                        <div class="post-form">
                            <h3>🍽️ Publicar Cardápio - ${nomesTurno[turno]}</h3>
                            
                            <div class="tipo-selector">
                                <button class="tipo-btn active" id="btn-texto" onclick="selecionarTipo('texto')">📝 Texto</button>
                                <button class="tipo-btn" id="btn-foto" onclick="selecionarTipo('foto')">📷 Foto</button>
                                <button class="tipo-btn" id="btn-video" onclick="selecionarTipo('video')">🎥 Vídeo</button>
                                <button class="tipo-btn" id="btn-pdf" onclick="selecionarTipo('pdf')">📎 PDF</button>
                            </div>
                            
                            <form method="post" action="/publicar-cardapio/${turno}" enctype="multipart/form-data" id="post-form">
                                <div class="post-input" id="input-texto">
                                    <input type="text" name="titulo" id="titulo-texto" placeholder="Título do cardápio" required>
                                    <textarea name="conteudo" id="conteudo-texto" placeholder="Descreva os alimentos..." rows="4"></textarea>
                                </div>
                                
                                <div class="post-input hidden" id="input-foto">
                                    <input type="text" name="titulo" id="titulo-foto" placeholder="Título do cardápio">
                                    <input type="file" name="arquivo" id="arquivo-foto" accept="image/*">
                                    <textarea name="conteudo" id="conteudo-foto" placeholder="Descrição da imagem" rows="2"></textarea>
                                </div>
                                
                                <div class="post-input hidden" id="input-video">
                                    <input type="text" name="titulo" id="titulo-video" placeholder="Título do cardápio">
                                    <input type="file" name="arquivo" id="arquivo-video" accept="video/*">
                                    <textarea name="conteudo" id="conteudo-video" placeholder="Descrição do vídeo" rows="2"></textarea>
                                </div>
                                
                                <div class="post-input hidden" id="input-pdf">
                                    <input type="text" name="titulo" id="titulo-pdf" placeholder="Título do cardápio">
                                    <input type="file" name="arquivo" id="arquivo-pdf" accept=".pdf">
                                    <textarea name="conteudo" id="conteudo-pdf" placeholder="Descrição do PDF" rows="2"></textarea>
                                    <small style="color: #666;">Selecione apenas arquivos PDF</small>
                                </div>
                                
                                <input type="hidden" name="tipo" id="tipo-post" value="texto">
                                <button type="submit" style="width: 100%; margin-top: 15px;">Publicar Cardápio</button>
                            </form>
                        </div>
                        `;
                    }
                    
                    const conteudo = `
                    <div class="feed-container">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                            <h2>${nomesTurno[turno]}</h2>
                            <a href="/cardapio" style="background: #666; color: white; padding: 8px 15px; border-radius: 20px; text-decoration: none;">← Voltar aos turnos</a>
                        </div>
                        
                        <p style="text-align: center; color: #666; margin-bottom: 20px;">Acompanhe aqui as informações sobre alimentação escolar - Turno ${turno}</p>
                        
                        ${mensagem}
                        
                        ${formularioPublicacao}
                        
                        <div id="posts-container">
                            ${postsHtml}
                        </div>
                    </div>
                    
                    <script>
                        const usuarioAtual = '${req.session.user}';
                        
                        function selecionarTipo(tipo) {
                            document.getElementById('tipo-post').value = tipo;
                            
                            document.querySelectorAll('.tipo-btn').forEach(btn => {
                                btn.classList.remove('active');
                            });
                            document.getElementById('btn-' + tipo).classList.add('active');
                            
                            document.querySelectorAll('.post-input').forEach(el => {
                                el.classList.add('hidden');
                                el.querySelectorAll('input, textarea').forEach(campo => {
                                    campo.removeAttribute('required');
                                    if (campo.type === 'file') {
                                        campo.value = '';
                                    }
                                });
                            });
                            
                            const inputToShow = document.getElementById('input-' + tipo);
                            if (inputToShow) {
                                inputToShow.classList.remove('hidden');
                                
                                if (tipo === 'texto') {
                                    document.getElementById('titulo-texto').setAttribute('required', 'required');
                                } else if (tipo === 'foto') {
                                    document.getElementById('titulo-foto').setAttribute('required', 'required');
                                    document.getElementById('arquivo-foto').setAttribute('required', 'required');
                                } else if (tipo === 'video') {
                                    document.getElementById('titulo-video').setAttribute('required', 'required');
                                    document.getElementById('arquivo-video').setAttribute('required', 'required');
                                } else if (tipo === 'pdf') {
                                    document.getElementById('titulo-pdf').setAttribute('required', 'required');
                                    document.getElementById('arquivo-pdf').setAttribute('required', 'required');
                                }
                            }
                        }
                        
                        function likeCardapio(postId) {
                            const btn = document.querySelector(\`.like-btn[data-post="\${postId}"]\`);
                            
                            btn.disabled = true;
                            btn.style.opacity = '0.7';
                            
                            fetch('/like/cardapio/' + postId, { 
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                }
                            })
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success) {
                                        document.getElementById('likes-' + postId).textContent = data.likes;
                                        
                                        if (data.liked) {
                                            btn.classList.add('liked');
                                            localStorage.setItem(\`liked_cardapio_\${postId}_\${usuarioAtual}\`, 'true');
                                            btn.style.transform = 'scale(1.2)';
                                            setTimeout(() => {
                                                btn.style.transform = 'scale(1)';
                                            }, 200);
                                        } else {
                                            btn.classList.remove('liked');
                                            localStorage.removeItem(\`liked_cardapio_\${postId}_\${usuarioAtual}\`);
                                        }
                                    } else {
                                        alert("Erro ao processar like");
                                    }
                                })
                                .catch(err => {
                                    console.error('Erro:', err);
                                    alert("Erro de conexão");
                                })
                                .finally(() => {
                                    btn.disabled = false;
                                    btn.style.opacity = '1';
                                });
                        }
                        
                        function carregarLikesUsuario() {
                            fetch('/api/likes/cardapio/' + usuarioAtual)
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success && data.likes) {
                                        data.likes.forEach(postId => {
                                            const btn = document.querySelector(\`.like-btn[data-post="\${postId}"]\`);
                                            if (btn) {
                                                btn.classList.add('liked');
                                                localStorage.setItem(\`liked_cardapio_\${postId}_\${usuarioAtual}\`, 'true');
                                            }
                                        });
                                    }
                                })
                                .catch(err => console.error('Erro ao carregar likes:', err));
                        }
                        
                        function editarCardapio(postId) {
                            document.getElementById('post-content-' + postId).classList.add('hidden');
                            document.getElementById('edit-form-' + postId).classList.remove('hidden');
                        }
                        
                        function cancelarEdicao(postId) {
                            document.getElementById('post-content-' + postId).classList.remove('hidden');
                            document.getElementById('edit-form-' + postId).classList.add('hidden');
                        }
                        
                        document.addEventListener('DOMContentLoaded', function() {
                            selecionarTipo('texto');
                            carregarLikesUsuario();
                        });
                    </script>
                    `;
                    
                    res.send(layout(`Cardápio ${turno}`, conteudo, req.session.user, userCargo));
                }
            );
        }
    );
});

// ===== ROTA PARA PUBLICAR NO CARDÁPIO =====

app.post("/publicar-cardapio/:turno", upload.single('arquivo'), (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    const turno = req.params.turno;
    
    if (!['matutino', 'vespertino', 'noturno'].includes(turno)) {
        return res.redirect("/cardapio");
    }
    
    db.query("SELECT cargo FROM usuarios WHERE user=?", [req.session.user], (err, result) => {
        if (err || !result || result.length === 0) {
            return res.redirect(`/cardapio/${turno}?erro=permissao`);
        }
        
        const cargo = result[0].cargo;
        if (!cargo || !cargo.includes('Agente Merenda')) {
            return res.redirect(`/cardapio/${turno}?erro=permissao`);
        }
        
        let { titulo, conteudo, tipo } = req.body;
        const arquivo = req.file ? req.file.filename : null;
        
        if (Array.isArray(titulo)) {
            titulo = titulo.find(t => t && t.trim() !== '') || '';
        }
        
        if (Array.isArray(conteudo)) {
            conteudo = conteudo.find(c => c && c.trim() !== '') || '';
        }
        
        if (!titulo || !titulo.trim()) {
            return res.redirect(`/cardapio/${turno}?erro=titulo_vazio`);
        }
        
        if (tipo === 'texto' && (!conteudo || !conteudo.trim())) {
            return res.redirect(`/cardapio/${turno}?erro=texto_vazio`);
        }
        
        if ((tipo === 'foto' || tipo === 'video' || tipo === 'pdf') && !arquivo) {
            return res.redirect(`/cardapio/${turno}?erro=arquivo_vazio`);
        }
        
        if (tipo === 'pdf' && arquivo) {
            const extensao = path.extname(arquivo).toLowerCase();
            if (extensao !== '.pdf') {
                return res.redirect(`/cardapio/${turno}?erro=pdf_invalido`);
            }
        }
        
        const query = "INSERT INTO cardapio_posts (user, titulo, conteudo, tipo, arquivo, turno) VALUES (?, ?, ?, ?, ?, ?)";
        const valores = [
            req.session.user, 
            titulo,
            conteudo || null, 
            tipo, 
            arquivo || null,
            turno
        ];
        
        db.query(query, valores, (err, result) => {
            if (err) {
                console.log("❌ ERRO DETALHADO NO BANCO DE DADOS:", err);
                return res.redirect(`/cardapio/${turno}?erro=banco`);
            }
            
            console.log("✅ Cardápio criado com sucesso! ID:", result.insertId);
            res.redirect(`/cardapio/${turno}?sucesso=post_criado`);
        });
    });
});

// ===== ROTA PARA EDIÇÃO DE CARDÁPIO =====

app.post("/editar-cardapio/:postId", upload.single('arquivo'), (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    const postId = req.params.postId;
    const { titulo, conteudo } = req.body;
    const arquivo = req.file ? req.file.filename : null;
    
    db.query("SELECT turno, user FROM cardapio_posts WHERE id = ?", [postId], (err, postResult) => {
        if (err || !postResult || postResult.length === 0) {
            return res.redirect("/cardapio");
        }
        
        const turno = postResult[0].turno;
        const donoPost = postResult[0].user;
        
        db.query("SELECT cargo FROM usuarios WHERE user=?", [req.session.user], (err, userResult) => {
            if (err || !userResult || userResult.length === 0) {
                return res.redirect(`/cardapio/${turno}`);
            }
            
            const cargo = userResult[0].cargo;
            
            if (!cargo || !cargo.includes('Agente Merenda') || donoPost !== req.session.user) {
                return res.redirect(`/cardapio/${turno}?erro=permissao`);
            }
            
            let query = "UPDATE cardapio_posts SET titulo = ?, conteudo = ?";
            let valores = [titulo, conteudo || null];
            
            if (arquivo) {
                query += ", arquivo = ?";
                valores.push(arquivo);
            }
            
            query += " WHERE id = ? AND user = ?";
            valores.push(postId, req.session.user);
            
            db.query(query, valores, (err, result) => {
                if (err) {
                    console.log(err);
                }
                res.redirect(`/cardapio/${turno}`);
            });
        });
    });
});

// ===== ROTA PARA DELETAR CARDÁPIO =====

app.get("/deletar-cardapio/:postId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    const postId = req.params.postId;
    
    db.query("SELECT turno, user FROM cardapio_posts WHERE id = ?", [postId], (err, postResult) => {
        if (err || !postResult || postResult.length === 0) {
            return res.redirect("/cardapio");
        }
        
        const turno = postResult[0].turno;
        const donoPost = postResult[0].user;
        
        db.query("SELECT cargo FROM usuarios WHERE user=?", [req.session.user], (err, userResult) => {
            if (err || !userResult || userResult.length === 0) {
                return res.redirect(`/cardapio/${turno}`);
            }
            
            const cargo = userResult[0].cargo;
            
            if (!cargo || !cargo.includes('Agente Merenda') || donoPost !== req.session.user) {
                return res.redirect(`/cardapio/${turno}?erro=permissao`);
            }
            
            db.query("DELETE FROM cardapio_posts WHERE id = ? AND user = ?", [postId, req.session.user], (err, result) => {
                if (err) {
                    console.log(err);
                }
                res.redirect(`/cardapio/${turno}`);
            });
        });
    });
});

// ===== ROTA PARA LIKES NO CARDÁPIO =====

app.post("/like/cardapio/:postId", (req, res) => {
    if (!req.session.user) {
        return res.json({ success: false, error: "Não logado" });
    }
    
    const postId = req.params.postId;
    const user = req.session.user;
    
    console.log(`🔄 Processando like no cardápio ${postId} pelo usuário ${user}`);
    
    db.query(
        "SELECT * FROM likes WHERE user = ? AND cardapio_id = ?",
        [user, postId],
        (err, result) => {
            if (err) {
                console.log("❌ Erro ao verificar like:", err);
                return res.json({ success: false, error: "Erro ao verificar like" });
            }
            
            const jaCurtiu = result && result.length > 0;
            
            if (jaCurtiu) {
                db.query(
                    "DELETE FROM likes WHERE user = ? AND cardapio_id = ?",
                    [user, postId],
                    (err, deleteResult) => {
                        if (err) {
                            console.log("❌ Erro ao remover like:", err);
                            return res.json({ success: false, error: "Erro ao remover like" });
                        }
                        
                        db.query(
                            "UPDATE cardapio_posts SET likes = likes - 1 WHERE id = ?",
                            [postId],
                            (err, updateResult) => {
                                if (err) {
                                    console.log("❌ Erro ao atualizar contador:", err);
                                    return res.json({ success: false, error: "Erro ao atualizar contador" });
                                }
                                
                                db.query(
                                    "SELECT likes FROM cardapio_posts WHERE id = ?",
                                    [postId],
                                    (err, selectResult) => {
                                        if (err) {
                                            console.log("❌ Erro ao buscar likes atualizados:", err);
                                            return res.json({ success: false });
                                        }
                                        
                                        const novosLikes = selectResult[0]?.likes || 0;
                                        
                                        res.json({ 
                                            success: true, 
                                            likes: novosLikes,
                                            liked: false 
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            } else {
                db.query(
                    "INSERT INTO likes (user, cardapio_id) VALUES (?, ?)",
                    [user, postId],
                    (err, insertResult) => {
                        if (err) {
                            console.log("❌ Erro ao adicionar like:", err);
                            
                            if (err.code === 'ER_DUP_ENTRY') {
                                return res.json({ success: false, error: "Like já existe" });
                            }
                            
                            return res.json({ success: false, error: "Erro ao adicionar like" });
                        }
                        
                        db.query(
                            "UPDATE cardapio_posts SET likes = likes + 1 WHERE id = ?",
                            [postId],
                            (err, updateResult) => {
                                if (err) {
                                    console.log("❌ Erro ao atualizar contador:", err);
                                    return res.json({ success: false, error: "Erro ao atualizar contador" });
                                }
                                
                                db.query(
                                    "SELECT likes FROM cardapio_posts WHERE id = ?",
                                    [postId],
                                    (err, selectResult) => {
                                        if (err) {
                                            console.log("❌ Erro ao buscar likes atualizados:", err);
                                            return res.json({ success: false });
                                        }
                                        
                                        const novosLikes = selectResult[0]?.likes || 0;
                                        
                                        res.json({ 
                                            success: true, 
                                            likes: novosLikes,
                                            liked: true 
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            }
        }
    );
});

// ===== ROTA PARA VERIFICAR LIKES DO USUÁRIO NO CARDÁPIO =====

app.get("/api/likes/cardapio/:usuario", (req, res) => {
    if (!req.session.user || req.session.user !== req.params.usuario) {
        return res.json({ success: false, error: "Não autorizado" });
    }
    
    const usuario = req.params.usuario;
    
    db.query(
        "SELECT cardapio_id FROM likes WHERE user = ? AND cardapio_id IS NOT NULL",
        [usuario],
        (err, result) => {
            if (err) {
                console.log("❌ Erro ao buscar likes do usuário:", err);
                return res.json({ success: false, error: "Erro ao buscar likes" });
            }
            
            const likes = result.map(row => row.cardapio_id);
            res.json({ success: true, likes: likes });
        }
    );
});

// ===== ROTA PRINCIPAL DO BOLETIM =====

app.get("/boletim", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    db.query(
        "SELECT cargo, turma FROM usuarios WHERE user=?",
        [req.session.user],
        (err, userResult) => {
            if (err || !userResult || userResult.length === 0) {
                return res.redirect("/");
            }
            
            const userCargo = userResult[0].cargo;
            const userTurma = userResult[0].turma;
            
            if (userCargo && userCargo.includes('Aluno')) {
                return res.redirect(`/boletim/${userTurma}`);
            }
            
            const conteudo = `
            <div class="feed-container">
                <h2>📄 Boletins Escolares</h2>
                <p style="text-align: center; color: #666; margin-bottom: 30px;">Selecione uma turma para ver os boletins:</p>
                
                <div class="turmas-grid">
                    <a href="/boletim/1A" style="text-decoration: none;">
                        <div class="turma-card">
                            <h3>1º Ano A</h3>
                            <p>Acessar boletins</p>
                        </div>
                    </a>
                    <a href="/boletim/2A" style="text-decoration: none;">
                        <div class="turma-card">
                            <h3>2º Ano A</h3>
                            <p>Acessar boletins</p>
                        </div>
                    </a>
                    <a href="/boletim/3A" style="text-decoration: none;">
                        <div class="turma-card">
                            <h3>3º Ano A</h3>
                            <p>Acessar boletins</p>
                        </div>
                    </a>
                </div>
            </div>
            `;
            
            res.send(layout("Boletins", conteudo, req.session.user, userCargo, userTurma));
        }
    );
});

// ===== ROTA DO BOLETIM POR TURMA =====

app.get("/boletim/:turma", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    const turma = req.params.turma;
    
    db.query(
        "SELECT cargo, turma FROM usuarios WHERE user=?",
        [req.session.user],
        (err, userResult) => {
            if (err || !userResult || userResult.length === 0) {
                return res.redirect("/");
            }
            
            const userCargo = userResult[0].cargo;
            const userTurma = userResult[0].turma;
            
            if (userCargo && userCargo.includes('Aluno') && userTurma !== turma) {
                return res.redirect(`/boletim/${userTurma}`);
            }
            
            let mensagem = '';
            if (req.query.erro) {
                if (req.query.erro === 'arquivo_vazio') {
                    mensagem = '<div class="alert alert-error">❌ Selecione um arquivo para publicar!</div>';
                } else if (req.query.erro === 'texto_vazio') {
                    mensagem = '<div class="alert alert-error">❌ Escreva algo para publicar!</div>';
                } else if (req.query.erro === 'banco') {
                    mensagem = '<div class="alert alert-error">❌ Erro ao salvar no banco de dados!</div>';
                } else if (req.query.erro === 'pdf_invalido') {
                    mensagem = '<div class="alert alert-error">❌ Arquivo inválido! Selecione apenas PDFs.</div>';
                }
            } else if (req.query.sucesso === 'post_criado') {
                mensagem = '<div class="alert alert-success">✅ Boletim publicado com sucesso!</div>';
            }
            
            db.query(
                `SELECT b.*, u.cargo as autor_cargo 
                 FROM boletins_posts b
                 JOIN usuarios u ON b.user = u.user
                 WHERE b.turma = ?
                 ORDER BY b.created_at DESC`,
                [turma],
                (err, posts) => {
                    if (err) {
                        console.log(err);
                        return res.send(layout("Erro", "<h2>Erro ao carregar boletins</h2>", req.session.user, userCargo, userTurma));
                    }
                    
                    let postsHtml = '';
                    
                    if (posts && posts.length > 0) {
                        for (let post of posts) {
                            postsHtml += gerarPostBoletimHtml(post, req.session.user, userCargo, turma);
                        }
                    } else {
                        postsHtml = '<p style="text-align: center; color: #666; padding: 40px;">Nenhum boletim publicado ainda.</p>';
                    }
                    
                    const podePublicar = userCargo && (
                        userCargo.includes('Professor') || 
                        userCargo.includes('Diretor') || 
                        userCargo.includes('Coordenador') || 
                        userCargo.includes('Vice Diretor')
                    );
                    
                    let formularioPublicacao = '';
                    
                    if (podePublicar) {
                        formularioPublicacao = `
                        <div class="post-form">
                            <h3>📢 Publicar Boletim - Turma ${turma}</h3>
                            
                            <div class="tipo-selector">
                                <button class="tipo-btn active" id="btn-texto" onclick="selecionarTipo('texto')">📝 Texto</button>
                                <button class="tipo-btn" id="btn-foto" onclick="selecionarTipo('foto')">📷 Foto</button>
                                <button class="tipo-btn" id="btn-pdf" onclick="selecionarTipo('pdf')">📎 PDF</button>
                            </div>
                            
                            <form method="post" action="/publicar-boletim/${turma}" enctype="multipart/form-data" id="post-form">
                                <div class="post-input" id="input-texto">
                                    <textarea name="conteudo" placeholder="Digite as notas ou informações..." rows="4"></textarea>
                                </div>
                                
                                <div class="post-input hidden" id="input-foto">
                                    <input type="file" name="arquivo" accept="image/*">
                                    <textarea name="conteudo" placeholder="Descrição da imagem (opcional)" rows="2"></textarea>
                                </div>
                                
                                <div class="post-input hidden" id="input-pdf">
                                    <input type="file" name="arquivo" accept=".pdf" id="pdf-input">
                                    <textarea name="conteudo" placeholder="Descrição do PDF (opcional)" rows="2"></textarea>
                                    <small style="color: #666;">Selecione apenas arquivos PDF</small>
                                </div>
                                
                                <input type="hidden" name="tipo" id="tipo-post" value="texto">
                                <button type="submit" style="width: 100%; margin-top: 15px;">Publicar Boletim</button>
                            </form>
                        </div>
                        `;
                    }
                    
                    const conteudo = `
                    <div class="feed-container">
                        <h2>📄 Boletins - Turma ${turma}</h2>
                        
                        ${mensagem}
                        
                        ${formularioPublicacao}
                        
                        <div id="posts-container">
                            ${postsHtml}
                        </div>
                    </div>
                    
                    <script>
                        function selecionarTipo(tipo) {
                            document.getElementById('tipo-post').value = tipo;
                            
                            document.querySelectorAll('.tipo-btn').forEach(btn => {
                                btn.classList.remove('active');
                            });
                            document.getElementById('btn-' + tipo).classList.add('active');
                            
                            document.querySelectorAll('.post-input').forEach(el => {
                                el.classList.add('hidden');
                                el.querySelectorAll('input, textarea').forEach(campo => {
                                    campo.removeAttribute('required');
                                    if (campo.type === 'file') {
                                        campo.value = '';
                                    }
                                });
                            });
                            
                            const inputToShow = document.getElementById('input-' + tipo);
                            if (inputToShow) {
                                inputToShow.classList.remove('hidden');
                                
                                if (tipo === 'foto') {
                                    document.querySelector('#input-foto input[type="file"]').setAttribute('required', 'required');
                                } else if (tipo === 'pdf') {
                                    document.querySelector('#input-pdf input[type="file"]').setAttribute('required', 'required');
                                }
                            }
                        }
                        
                        function likePost(postId) {
                            fetch('/like/boletim/post/' + postId, { method: 'POST' })
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success) {
                                        document.getElementById('likes-' + postId).textContent = data.likes;
                                        const btn = document.querySelector('.like-btn[data-post="' + postId + '"]');
                                        btn.classList.toggle('liked');
                                    }
                                })
                                .catch(err => console.error('Erro:', err));
                        }
                        
                        function editarPost(postId) {
                            document.getElementById('post-content-' + postId).classList.add('hidden');
                            document.getElementById('edit-form-' + postId).classList.remove('hidden');
                        }
                        
                        function cancelarEdicao(postId) {
                            document.getElementById('post-content-' + postId).classList.remove('hidden');
                            document.getElementById('edit-form-' + postId).classList.add('hidden');
                        }
                    </script>
                    `;
                    
                    res.send(layout(`Boletim ${turma}`, conteudo, req.session.user, userCargo, userTurma));
                }
            );
        }
    );
});

// ===== ROTA PARA PUBLICAR NO BOLETIM =====

app.post("/publicar-boletim/:turma", upload.single('arquivo'), (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    const turma = req.params.turma;
    let { conteudo, tipo } = req.body;
    const arquivo = req.file ? req.file.filename : null;
    
    if (Array.isArray(conteudo)) {
        conteudo = conteudo.find(c => c && c.trim() !== '') || '';
    }
    
    if (tipo === 'texto' && (!conteudo || !conteudo.trim())) {
        return res.redirect(`/boletim/${turma}?erro=texto_vazio`);
    }
    
    if ((tipo === 'foto' || tipo === 'pdf') && !arquivo) {
        return res.redirect(`/boletim/${turma}?erro=arquivo_vazio`);
    }
    
    if (tipo === 'pdf' && arquivo) {
        const extensao = path.extname(arquivo).toLowerCase();
        if (extensao !== '.pdf') {
            return res.redirect(`/boletim/${turma}?erro=pdf_invalido`);
        }
    }
    
    const query = "INSERT INTO boletins_posts (user, turma, conteudo, tipo, arquivo) VALUES (?, ?, ?, ?, ?)";
    const valores = [
        req.session.user, 
        turma, 
        conteudo || null, 
        tipo, 
        arquivo || null
    ];
    
    db.query(query, valores, (err, result) => {
        if (err) {
            console.log("❌ ERRO NO BANCO DE DADOS - BOLETIM:", err);
            return res.redirect(`/boletim/${turma}?erro=banco`);
        }
        
        console.log("✅ Boletim criado com sucesso! ID:", result.insertId);
        res.redirect(`/boletim/${turma}?sucesso=post_criado`);
    });
});

function gerarPostBoletimHtml(post, usuarioLogado, cargoUsuario, turmaAtual) {
    const podeEditar = (post.user === usuarioLogado) || 
                       (cargoUsuario && (cargoUsuario.includes('Diretor') || 
                        cargoUsuario.includes('Coordenador') || 
                        cargoUsuario.includes('Professor')));
    
    let conteudoPost = '';
    const dataPost = new Date(post.created_at).toLocaleString('pt-BR');
    
    if (post.tipo === 'texto') {
        conteudoPost = `
            <div style="background: #f8f9fa; padding: 20px; border-radius: 10px;">
                <p style="font-size: 1.1em; line-height: 1.6; white-space: pre-wrap;">${post.conteudo}</p>
            </div>
        `;
    } else if (post.tipo === 'foto') {
        conteudoPost = `
            <div style="text-align: center;">
                <img src="/uploads/${post.arquivo}" class="post-media" style="max-height: 400px;">
                ${post.conteudo ? `<p style="margin-top: 10px; background: #f8f9fa; padding: 15px; border-radius: 10px;">${post.conteudo}</p>` : ''}
            </div>
        `;
    } else if (post.tipo === 'pdf') {
        conteudoPost = `
            <div class="pdf-container">
                <div class="pdf-header">
                    <div>
                        <span class="pdf-title">📄 Boletim em PDF</span>
                        <div class="pdf-info">
                            Publicado por: ${post.user} (${post.autor_cargo})
                        </div>
                        ${post.conteudo ? `<p style="margin-top: 10px; color: #666;">${post.conteudo}</p>` : ''}
                    </div>
                    <a href="/uploads/${post.arquivo}" class="pdf-download" download>📥 Download</a>
                </div>
                <iframe src="/uploads/${post.arquivo}#toolbar=1&navpanes=1" class="pdf-viewer"></iframe>
            </div>
        `;
    }
    
    return `
    <div class="post" id="post-${post.id}">
        <div class="post-header">
            <span class="post-author">👤 ${post.user} (${post.autor_cargo})</span>
            <span class="post-date">📅 ${dataPost}</span>
        </div>
        
        <div class="post-content" id="post-content-${post.id}">
            ${conteudoPost}
        </div>
        
        ${podeEditar ? `
        <div class="edit-form hidden" id="edit-form-${post.id}">
            <form method="post" action="/editar-boletim/${post.id}?turma=${turmaAtual}" enctype="multipart/form-data">
                <textarea name="conteudo" rows="3" placeholder="Conteúdo...">${post.conteudo || ''}</textarea>
                <input type="file" name="arquivo" accept="image/*,.pdf">
                <div style="display: flex; gap: 10px;">
                    <button type="submit">Salvar</button>
                    <button type="button" onclick="cancelarEdicao(${post.id})" style="background: #666;">Cancelar</button>
                </div>
            </form>
        </div>
        ` : ''}
        
        <div class="post-actions">
            <button class="action-btn like-btn" data-post="${post.id}" onclick="likePost(${post.id})">
                👍 <span id="likes-${post.id}">${post.likes || 0}</span>
            </button>
            
            ${podeEditar ? `
            <button class="action-btn" onclick="editarPost(${post.id})">✏️ Editar</button>
            <a href="/deletar-boletim/${post.id}?turma=${turmaAtual}" class="action-btn" onclick="return confirm('Tem certeza que deseja deletar este boletim?')">🗑️ Deletar</a>
            ` : ''}
        </div>
    </div>
    `;
}

// ===== ROTAS PARA EDIÇÃO/DELEÇÃO DE BOLETINS =====

app.post("/editar-boletim/:postId", upload.single('arquivo'), (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    const postId = req.params.postId;
    const turma = req.query.turma;
    const { conteudo } = req.body;
    const arquivo = req.file ? req.file.filename : null;
    
    let query = "UPDATE boletins_posts SET conteudo = ?";
    let valores = [conteudo || null];
    
    if (arquivo) {
        query += ", arquivo = ?";
        valores.push(arquivo);
    }
    
    query += " WHERE id = ? AND user = ?";
    valores.push(postId, req.session.user);
    
    db.query(query, valores, (err, result) => {
        if (err) {
            console.log(err);
        }
        res.redirect(`/boletim/${turma}`);
    });
});

app.get("/deletar-boletim/:postId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    const postId = req.params.postId;
    const turma = req.query.turma;
    
    db.query("DELETE FROM boletins_posts WHERE id = ? AND user = ?", [postId, req.session.user], (err, result) => {
        if (err) {
            console.log(err);
        }
        res.redirect(`/boletim/${turma}`);
    });
});

// ===== ROTAS PARA LIKES NO BOLETIM =====

app.post("/like/boletim/post/:postId", (req, res) => {
    if (!req.session.user) {
        return res.json({ success: false, error: "Não logado" });
    }
    
    const postId = req.params.postId;
    const user = req.session.user;
    
    db.query(
        "SELECT * FROM likes WHERE user = ? AND boletim_id = ?",
        [user, postId],
        (err, result) => {
            if (err) {
                console.log(err);
                return res.json({ success: false });
            }
            
            if (result && result.length > 0) {
                db.query(
                    "DELETE FROM likes WHERE user = ? AND boletim_id = ?",
                    [user, postId],
                    (err) => {
                        if (err) {
                            console.log(err);
                            return res.json({ success: false });
                        }
                        
                        db.query(
                            "UPDATE boletins_posts SET likes = likes - 1 WHERE id = ?",
                            [postId],
                            (err) => {
                                if (err) {
                                    console.log(err);
                                    return res.json({ success: false });
                                }
                                
                                db.query(
                                    "SELECT likes FROM boletins_posts WHERE id = ?",
                                    [postId],
                                    (err, result) => {
                                        if (err) {
                                            console.log(err);
                                            return res.json({ success: false });
                                        }
                                        res.json({ success: true, likes: result[0].likes });
                                    }
                                );
                            }
                        );
                    }
                );
            } else {
                db.query(
                    "INSERT INTO likes (user, boletim_id) VALUES (?, ?)",
                    [user, postId],
                    (err) => {
                        if (err) {
                            console.log(err);
                            return res.json({ success: false });
                        }
                        
                        db.query(
                            "UPDATE boletins_posts SET likes = likes + 1 WHERE id = ?",
                            [postId],
                            (err) => {
                                if (err) {
                                    console.log(err);
                                    return res.json({ success: false });
                                }
                                
                                db.query(
                                    "SELECT likes FROM boletins_posts WHERE id = ?",
                                    [postId],
                                    (err, result) => {
                                        if (err) {
                                            console.log(err);
                                            return res.json({ success: false });
                                        }
                                        res.json({ success: true, likes: result[0].likes });
                                    }
                                );
                            }
                        );
                    }
                );
            }
        }
    );
});

// ===== FUNÇÃO GERADORA DE POST DO CARDÁPIO =====

function gerarPostCardapioHtml(post, usuarioLogado, cargoUsuario) {
    const podeEditar = (post.user === usuarioLogado) && 
                       (cargoUsuario && cargoUsuario.includes('Agente Merenda'));
    
    let conteudoPost = '';
    const dataPost = new Date(post.created_at).toLocaleString('pt-BR');
    
    if (post.tipo === 'texto') {
        conteudoPost = `
            <div style="background: #f8f9fa; padding: 20px; border-radius: 10px;">
                <h3 style="color: #004080; margin-bottom: 15px;">${post.titulo}</h3>
                <p style="font-size: 1.1em; line-height: 1.6; white-space: pre-wrap;">${post.conteudo}</p>
            </div>
        `;
    } else if (post.tipo === 'foto') {
        conteudoPost = `
            <div style="text-align: center;">
                <h3 style="color: #004080; margin-bottom: 15px;">${post.titulo}</h3>
                <img src="/uploads/${post.arquivo}" class="post-media" style="max-height: 400px;">
                ${post.conteudo ? `<p style="margin-top: 10px; background: #f8f9fa; padding: 15px; border-radius: 10px;">${post.conteudo}</p>` : ''}
            </div>
        `;
    } else if (post.tipo === 'video') {
        conteudoPost = `
            <div style="text-align: center;">
                <h3 style="color: #004080; margin-bottom: 15px;">${post.titulo}</h3>
                <video controls class="post-media" style="max-height: 400px;">
                    <source src="/uploads/${post.arquivo}">
                </video>
                ${post.conteudo ? `<p style="margin-top: 10px; background: #f8f9fa; padding: 15px; border-radius: 10px;">${post.conteudo}</p>` : ''}
            </div>
        `;
    } else if (post.tipo === 'pdf') {
        conteudoPost = `
            <div class="pdf-container">
                <div class="pdf-header">
                    <div>
                        <span class="pdf-title">📄 ${post.titulo}</span>
                        <div class="pdf-info">
                            Publicado por: ${post.user} (${post.autor_cargo})
                        </div>
                        ${post.conteudo ? `<p style="margin-top: 10px; color: #666;">${post.conteudo}</p>` : ''}
                    </div>
                    <a href="/uploads/${post.arquivo}" class="pdf-download" download>📥 Download</a>
                </div>
                <iframe src="/uploads/${post.arquivo}#toolbar=1&navpanes=1" class="pdf-viewer"></iframe>
            </div>
        `;
    }
    
    return `
    <div class="post" id="post-${post.id}">
        <div class="post-header">
            <span class="post-author">👤 ${post.user} (${post.autor_cargo})</span>
            <span class="post-date">📅 ${dataPost}</span>
        </div>
        
        <div class="post-content" id="post-content-${post.id}">
            ${conteudoPost}
        </div>
        
        ${podeEditar ? `
        <div class="edit-form hidden" id="edit-form-${post.id}">
            <form method="post" action="/editar-cardapio/${post.id}" enctype="multipart/form-data">
                <input type="text" name="titulo" value="${post.titulo || ''}" placeholder="Título" required>
                <textarea name="conteudo" rows="3" placeholder="Conteúdo...">${post.conteudo || ''}</textarea>
                <input type="file" name="arquivo" accept="image/*,video/*,.pdf">
                <div style="display: flex; gap: 10px;">
                    <button type="submit">Salvar</button>
                    <button type="button" onclick="cancelarEdicao(${post.id})" style="background: #666;">Cancelar</button>
                </div>
            </form>
        </div>
        ` : ''}
        
        <div class="post-actions">
            <button class="action-btn like-btn" data-post="${post.id}" onclick="likeCardapio(${post.id})">
                👍 <span id="likes-${post.id}">${post.likes || 0}</span>
            </button>
            
            ${podeEditar ? `
            <button class="action-btn" onclick="editarCardapio(${post.id})">✏️ Editar</button>
            <a href="/deletar-cardapio/${post.id}" class="action-btn" onclick="return confirm('Tem certeza que deseja deletar este cardápio?')">🗑️ Deletar</a>
            ` : ''}
        </div>
    </div>
    `;
}

// ===== FUNÇÃO GERADORA DE POST DA LIMPEZA =====

function gerarPostLimpezaHtml(post, usuarioLogado, cargoUsuario) {
    const podeEditar = (post.user === usuarioLogado) && 
                       (cargoUsuario && cargoUsuario.includes('Profissional Limpeza'));
    
    let conteudoPost = '';
    const dataPost = new Date(post.created_at).toLocaleString('pt-BR');
    
    if (post.tipo === 'texto') {
        conteudoPost = `
            <div style="background: #f8f9fa; padding: 20px; border-radius: 10px;">
                <h3 style="color: #004080; margin-bottom: 15px;">${post.titulo}</h3>
                <p style="font-size: 1.1em; line-height: 1.6; white-space: pre-wrap;">${post.conteudo}</p>
            </div>
        `;
    } else if (post.tipo === 'foto') {
        conteudoPost = `
            <div style="text-align: center;">
                <h3 style="color: #004080; margin-bottom: 15px;">${post.titulo}</h3>
                <img src="/uploads/${post.arquivo}" class="post-media" style="max-height: 400px;">
                ${post.conteudo ? `<p style="margin-top: 10px; background: #f8f9fa; padding: 15px; border-radius: 10px;">${post.conteudo}</p>` : ''}
            </div>
        `;
    } else if (post.tipo === 'video') {
        conteudoPost = `
            <div style="text-align: center;">
                <h3 style="color: #004080; margin-bottom: 15px;">${post.titulo}</h3>
                <video controls class="post-media" style="max-height: 400px;">
                    <source src="/uploads/${post.arquivo}">
                </video>
                ${post.conteudo ? `<p style="margin-top: 10px; background: #f8f9fa; padding: 15px; border-radius: 10px;">${post.conteudo}</p>` : ''}
            </div>
        `;
    } else if (post.tipo === 'pdf') {
        conteudoPost = `
            <div class="pdf-container">
                <div class="pdf-header">
                    <div>
                        <span class="pdf-title">📄 ${post.titulo}</span>
                        <div class="pdf-info">
                            Publicado por: ${post.user} (${post.autor_cargo})
                        </div>
                        ${post.conteudo ? `<p style="margin-top: 10px; color: #666;">${post.conteudo}</p>` : ''}
                    </div>
                    <a href="/uploads/${post.arquivo}" class="pdf-download" download>📥 Download</a>
                </div>
                <iframe src="/uploads/${post.arquivo}#toolbar=1&navpanes=1" class="pdf-viewer"></iframe>
            </div>
        `;
    }
    
    return `
    <div class="post" id="post-${post.id}">
        <div class="post-header">
            <span class="post-author">👤 ${post.user} (${post.autor_cargo})</span>
            <span class="post-date">📅 ${dataPost}</span>
        </div>
        
        <div class="post-content" id="post-content-${post.id}">
            ${conteudoPost}
        </div>
        
        ${podeEditar ? `
        <div class="edit-form hidden" id="edit-form-${post.id}">
            <form method="post" action="/editar-limpeza/${post.id}" enctype="multipart/form-data">
                <input type="text" name="titulo" value="${post.titulo || ''}" placeholder="Título" required>
                <textarea name="conteudo" rows="3" placeholder="Conteúdo...">${post.conteudo || ''}</textarea>
                <input type="file" name="arquivo" accept="image/*,video/*,.pdf">
                <div style="display: flex; gap: 10px;">
                    <button type="submit">Salvar</button>
                    <button type="button" onclick="cancelarEdicao(${post.id})" style="background: #666;">Cancelar</button>
                </div>
            </form>
        </div>
        ` : ''}
        
        <div class="post-actions">
            <button class="action-btn like-btn" data-post="${post.id}" onclick="likeLimpeza(${post.id})">
                👍 <span id="likes-${post.id}">${post.likes || 0}</span>
            </button>
            
            ${podeEditar ? `
            <button class="action-btn" onclick="editarPost(${post.id})">✏️ Editar</button>
            <a href="/deletar-limpeza/${post.id}" class="action-btn" onclick="return confirm('Tem certeza que deseja deletar este post?')">🗑️ Deletar</a>
            ` : ''}
        </div>
    </div>
    `;
}

// ===== FUNÇÃO GERADORA DE POST DO PÁTIO/MANUTENÇÃO =====

function gerarPostPatioHtml(post, usuarioLogado, cargoUsuario) {
    const podeEditar = (post.user === usuarioLogado) && 
                       (cargoUsuario && cargoUsuario.includes('Cuidador Patio'));
    
    let conteudoPost = '';
    const dataPost = new Date(post.created_at).toLocaleString('pt-BR');
    
    if (post.tipo === 'texto') {
        conteudoPost = `
            <div style="background: #f8f9fa; padding: 20px; border-radius: 10px;">
                <h3 style="color: #004080; margin-bottom: 15px;">${post.titulo}</h3>
                <p style="font-size: 1.1em; line-height: 1.6; white-space: pre-wrap;">${post.conteudo}</p>
            </div>
        `;
    } else if (post.tipo === 'foto') {
        conteudoPost = `
            <div style="text-align: center;">
                <h3 style="color: #004080; margin-bottom: 15px;">${post.titulo}</h3>
                <img src="/uploads/${post.arquivo}" class="post-media" style="max-height: 400px;">
                ${post.conteudo ? `<p style="margin-top: 10px; background: #f8f9fa; padding: 15px; border-radius: 10px;">${post.conteudo}</p>` : ''}
            </div>
        `;
    } else if (post.tipo === 'video') {
        conteudoPost = `
            <div style="text-align: center;">
                <h3 style="color: #004080; margin-bottom: 15px;">${post.titulo}</h3>
                <video controls class="post-media" style="max-height: 400px;">
                    <source src="/uploads/${post.arquivo}">
                </video>
                ${post.conteudo ? `<p style="margin-top: 10px; background: #f8f9fa; padding: 15px; border-radius: 10px;">${post.conteudo}</p>` : ''}
            </div>
        `;
    } else if (post.tipo === 'pdf') {
        conteudoPost = `
            <div class="pdf-container">
                <div class="pdf-header">
                    <div>
                        <span class="pdf-title">📄 ${post.titulo}</span>
                        <div class="pdf-info">
                            Publicado por: ${post.user} (${post.autor_cargo})
                        </div>
                        ${post.conteudo ? `<p style="margin-top: 10px; color: #666;">${post.conteudo}</p>` : ''}
                    </div>
                    <a href="/uploads/${post.arquivo}" class="pdf-download" download>📥 Download</a>
                </div>
                <iframe src="/uploads/${post.arquivo}#toolbar=1&navpanes=1" class="pdf-viewer"></iframe>
            </div>
        `;
    }
    
    return `
    <div class="post" id="post-${post.id}">
        <div class="post-header">
            <span class="post-author">👤 ${post.user} (${post.autor_cargo})</span>
            <span class="post-date">📅 ${dataPost}</span>
        </div>
        
        <div class="post-content" id="post-content-${post.id}">
            ${conteudoPost}
        </div>
        
        ${podeEditar ? `
        <div class="edit-form hidden" id="edit-form-${post.id}">
            <form method="post" action="/editar-pat/${post.id}" enctype="multipart/form-data">
                <input type="text" name="titulo" value="${post.titulo || ''}" placeholder="Título" required>
                <textarea name="conteudo" rows="3" placeholder="Conteúdo...">${post.conteudo || ''}</textarea>
                <input type="file" name="arquivo" accept="image/*,video/*,.pdf">
                <div style="display: flex; gap: 10px;">
                    <button type="submit">Salvar</button>
                    <button type="button" onclick="cancelarEdicao(${post.id})" style="background: #666;">Cancelar</button>
                </div>
            </form>
        </div>
        ` : ''}
        
        <div class="post-actions">
            <button class="action-btn like-btn" data-post="${post.id}" onclick="likePatio(${post.id})">
                👍 <span id="likes-${post.id}">${post.likes || 0}</span>
            </button>
            
            ${podeEditar ? `
            <button class="action-btn" onclick="editarPost(${post.id})">✏️ Editar</button>
            <a href="/deletar-pat/${post.id}" class="action-btn" onclick="return confirm('Tem certeza que deseja deletar este post?')">🗑️ Deletar</a>
            ` : ''}
        </div>
    </div>
    `;
}

// ===== ROTA PRINCIPAL DA LIMPEZA =====

app.get("/limpeza", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    db.query(
        "SELECT cargo FROM usuarios WHERE user=?",
        [req.session.user],
        (err, userResult) => {
            if (err || !userResult || userResult.length === 0) {
                return res.redirect("/");
            }
            
            const userCargo = userResult[0].cargo;
            
            db.query(
                `SELECT l.*, u.cargo as autor_cargo 
                 FROM limpeza_posts l
                 JOIN usuarios u ON l.user = u.user
                 ORDER BY l.created_at DESC`,
                (err, posts) => {
                    if (err) {
                        console.log("Erro ao carregar posts da limpeza:", err);
                        return res.send(layout("Erro", `
                        <div class="feed-container">
                            <h2>Erro ao carregar posts</h2>
                            <div class="alert alert-error">
                                Ocorreu um erro ao carregar os posts. Tente novamente mais tarde.
                            </div>
                        </div>
                        `, req.session.user, userCargo));
                    }
                    
                    let postsHtml = '';
                    
                    if (posts && posts.length > 0) {
                        for (let post of posts) {
                            postsHtml += gerarPostLimpezaHtml(post, req.session.user, userCargo);
                        }
                    } else {
                        postsHtml = '<p style="text-align: center; color: #666; padding: 40px;">Nenhum post publicado ainda.</p>';
                    }
                    
                    const podePublicar = userCargo && userCargo.includes('Profissional Limpeza');
                    
                    let formularioPublicacao = '';
                    
                    if (podePublicar) {
                        formularioPublicacao = `
                        <div class="post-form">
                            <h3>🧹 Publicar Post - Limpeza</h3>
                            
                            <div class="tipo-selector">
                                <button class="tipo-btn active" id="btn-texto" onclick="selecionarTipo('texto')">📝 Texto</button>
                                <button class="tipo-btn" id="btn-foto" onclick="selecionarTipo('foto')">📷 Foto</button>
                                <button class="tipo-btn" id="btn-video" onclick="selecionarTipo('video')">🎥 Vídeo</button>
                                <button class="tipo-btn" id="btn-pdf" onclick="selecionarTipo('pdf')">📎 PDF</button>
                            </div>
                            
                            <form method="post" action="/publicar-limpeza" enctype="multipart/form-data" id="post-form">
                                <div class="post-input" id="input-texto">
                                    <input type="text" name="titulo" id="titulo-texto" placeholder="Título do post" required>
                                    <textarea name="conteudo" id="conteudo-texto" placeholder="Conteúdo do post..." rows="4"></textarea>
                                </div>
                                
                                <div class="post-input hidden" id="input-foto">
                                    <input type="text" name="titulo" id="titulo-foto" placeholder="Título do post">
                                    <input type="file" name="arquivo" id="arquivo-foto" accept="image/*">
                                    <textarea name="conteudo" id="conteudo-foto" placeholder="Descrição da imagem" rows="2"></textarea>
                                </div>
                                
                                <div class="post-input hidden" id="input-video">
                                    <input type="text" name="titulo" id="titulo-video" placeholder="Título do post">
                                    <input type="file" name="arquivo" id="arquivo-video" accept="video/*">
                                    <textarea name="conteudo" id="conteudo-video" placeholder="Descrição do vídeo" rows="2"></textarea>
                                </div>
                                
                                <div class="post-input hidden" id="input-pdf">
                                    <input type="text" name="titulo" id="titulo-pdf" placeholder="Título do post">
                                    <input type="file" name="arquivo" id="arquivo-pdf" accept=".pdf">
                                    <textarea name="conteudo" id="conteudo-pdf" placeholder="Descrição do PDF" rows="2"></textarea>
                                    <small style="color: #666;">Selecione apenas arquivos PDF</small>
                                </div>
                                
                                <input type="hidden" name="tipo" id="tipo-post" value="texto">
                                <button type="submit" style="width: 100%; margin-top: 15px;">Publicar</button>
                            </form>
                        </div>
                        `;
                    }
                    
                    let mensagem = '';
                    if (req.query.erro) {
                        if (req.query.erro === 'arquivo_vazio') {
                            mensagem = '<div class="alert alert-error">❌ Selecione um arquivo para publicar!</div>';
                        } else if (req.query.erro === 'texto_vazio') {
                            mensagem = '<div class="alert alert-error">❌ Escreva algo para publicar!</div>';
                        } else if (req.query.erro === 'titulo_vazio') {
                            mensagem = '<div class="alert alert-error">❌ Digite um título para o post!</div>';
                        } else if (req.query.erro === 'banco') {
                            mensagem = '<div class="alert alert-error">❌ Erro ao salvar no banco de dados!</div>';
                        } else if (req.query.erro === 'pdf_invalido') {
                            mensagem = '<div class="alert alert-error">❌ Arquivo inválido! Selecione apenas PDFs.</div>';
                        }
                    } else if (req.query.sucesso === 'post_criado') {
                        mensagem = '<div class="alert alert-success">✅ Post publicado com sucesso!</div>';
                    }
                    
                    const conteudo = `
                    <div class="feed-container">
                        <h2>🧹 Limpeza</h2>
                        <p style="text-align: center; color: #666; margin-bottom: 20px;">Comunicados e informações sobre limpeza</p>
                        
                        ${mensagem}
                        
                        ${formularioPublicacao}
                        
                        <div id="posts-container">
                            ${postsHtml}
                        </div>
                    </div>
                    
                    <script>
                        const usuarioAtual = '${req.session.user}';
                        
                        function selecionarTipo(tipo) {
                            document.getElementById('tipo-post').value = tipo;
                            
                            document.querySelectorAll('.tipo-btn').forEach(btn => {
                                btn.classList.remove('active');
                            });
                            document.getElementById('btn-' + tipo).classList.add('active');
                            
                            document.querySelectorAll('.post-input').forEach(el => {
                                el.classList.add('hidden');
                                el.querySelectorAll('input, textarea').forEach(campo => {
                                    campo.removeAttribute('required');
                                    if (campo.type === 'file') {
                                        campo.value = '';
                                    }
                                });
                            });
                            
                            const inputToShow = document.getElementById('input-' + tipo);
                            if (inputToShow) {
                                inputToShow.classList.remove('hidden');
                                
                                if (tipo === 'texto') {
                                    document.getElementById('titulo-texto').setAttribute('required', 'required');
                                } else if (tipo === 'foto') {
                                    document.getElementById('titulo-foto').setAttribute('required', 'required');
                                    document.getElementById('arquivo-foto').setAttribute('required', 'required');
                                } else if (tipo === 'video') {
                                    document.getElementById('titulo-video').setAttribute('required', 'required');
                                    document.getElementById('arquivo-video').setAttribute('required', 'required');
                                } else if (tipo === 'pdf') {
                                    document.getElementById('titulo-pdf').setAttribute('required', 'required');
                                    document.getElementById('arquivo-pdf').setAttribute('required', 'required');
                                }
                            }
                        }
                        
                        function likeLimpeza(postId) {
                            const btn = document.querySelector(\`.like-btn[data-post="\${postId}"]\`);
                            
                            btn.disabled = true;
                            btn.style.opacity = '0.7';
                            
                            fetch('/like/limpeza/' + postId, { 
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                }
                            })
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success) {
                                        document.getElementById('likes-' + postId).textContent = data.likes;
                                        
                                        if (data.liked) {
                                            btn.classList.add('liked');
                                            localStorage.setItem(\`liked_limpeza_\${postId}_\${usuarioAtual}\`, 'true');
                                            btn.style.transform = 'scale(1.2)';
                                            setTimeout(() => {
                                                btn.style.transform = 'scale(1)';
                                            }, 200);
                                        } else {
                                            btn.classList.remove('liked');
                                            localStorage.removeItem(\`liked_limpeza_\${postId}_\${usuarioAtual}\`);
                                        }
                                    } else {
                                        alert("Erro ao processar like");
                                    }
                                })
                                .catch(err => {
                                    console.error('Erro:', err);
                                    alert("Erro de conexão");
                                })
                                .finally(() => {
                                    btn.disabled = false;
                                    btn.style.opacity = '1';
                                });
                        }
                        
                        function carregarLikesUsuario() {
                            fetch('/api/likes/limpeza/' + usuarioAtual)
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success && data.likes) {
                                        data.likes.forEach(postId => {
                                            const btn = document.querySelector(\`.like-btn[data-post="\${postId}"]\`);
                                            if (btn) {
                                                btn.classList.add('liked');
                                                localStorage.setItem(\`liked_limpeza_\${postId}_\${usuarioAtual}\`, 'true');
                                            }
                                        });
                                    }
                                })
                                .catch(err => console.error('Erro ao carregar likes:', err));
                        }
                        
                        function editarPost(postId) {
                            document.getElementById('post-content-' + postId).classList.add('hidden');
                            document.getElementById('edit-form-' + postId).classList.remove('hidden');
                        }
                        
                        function cancelarEdicao(postId) {
                            document.getElementById('post-content-' + postId).classList.remove('hidden');
                            document.getElementById('edit-form-' + postId).classList.add('hidden');
                        }
                        
                        document.addEventListener('DOMContentLoaded', function() {
                            selecionarTipo('texto');
                            carregarLikesUsuario();
                        });
                    </script>
                    `;
                    
                    res.send(layout("Limpeza", conteudo, req.session.user, userCargo));
                }
            );
        }
    );
});

// ===== ROTA PARA PUBLICAR NA LIMPEZA =====

app.post("/publicar-limpeza", upload.single('arquivo'), (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    db.query("SELECT cargo FROM usuarios WHERE user=?", [req.session.user], (err, result) => {
        if (err || !result || result.length === 0) {
            return res.redirect("/limpeza?erro=permissao");
        }
        
        const cargo = result[0].cargo;
        if (!cargo || !cargo.includes('Profissional Limpeza')) {
            return res.redirect("/limpeza?erro=permissao");
        }
        
        let { titulo, conteudo, tipo } = req.body;
        const arquivo = req.file ? req.file.filename : null;
        
        if (Array.isArray(titulo)) {
            titulo = titulo.find(t => t && t.trim() !== '') || '';
        }
        
        if (Array.isArray(conteudo)) {
            conteudo = conteudo.find(c => c && c.trim() !== '') || '';
        }
        
        if (!titulo || !titulo.trim()) {
            return res.redirect("/limpeza?erro=titulo_vazio");
        }
        
        if (tipo === 'texto' && (!conteudo || !conteudo.trim())) {
            return res.redirect("/limpeza?erro=texto_vazio");
        }
        
        if ((tipo === 'foto' || tipo === 'video' || tipo === 'pdf') && !arquivo) {
            return res.redirect("/limpeza?erro=arquivo_vazio");
        }
        
        if (tipo === 'pdf' && arquivo) {
            const extensao = path.extname(arquivo).toLowerCase();
            if (extensao !== '.pdf') {
                return res.redirect("/limpeza?erro=pdf_invalido");
            }
        }
        
        const query = "INSERT INTO limpeza_posts (user, titulo, conteudo, tipo, arquivo) VALUES (?, ?, ?, ?, ?)";
        const valores = [
            req.session.user, 
            titulo,
            conteudo || null, 
            tipo, 
            arquivo || null
        ];
        
        db.query(query, valores, (err, result) => {
            if (err) {
                console.log("❌ ERRO DETALHADO NO BANCO DE DADOS:", err);
                return res.redirect("/limpeza?erro=banco");
            }
            
            console.log("✅ Post da limpeza criado com sucesso! ID:", result.insertId);
            res.redirect("/limpeza?sucesso=post_criado");
        });
    });
});

// ===== ROTA PARA LIKES NA LIMPEZA =====

app.post("/like/limpeza/:postId", (req, res) => {
    if (!req.session.user) {
        return res.json({ success: false, error: "Não logado" });
    }
    
    const postId = req.params.postId;
    const user = req.session.user;
    
    console.log(`🔄 Processando like na limpeza ${postId} pelo usuário ${user}`);
    
    db.query(
        "SELECT * FROM likes WHERE user = ? AND limpeza_id = ?",
        [user, postId],
        (err, result) => {
            if (err) {
                console.log("❌ Erro ao verificar like:", err);
                return res.json({ success: false, error: "Erro ao verificar like" });
            }
            
            const jaCurtiu = result && result.length > 0;
            
            if (jaCurtiu) {
                db.query(
                    "DELETE FROM likes WHERE user = ? AND limpeza_id = ?",
                    [user, postId],
                    (err, deleteResult) => {
                        if (err) {
                            console.log("❌ Erro ao remover like:", err);
                            return res.json({ success: false, error: "Erro ao remover like" });
                        }
                        
                        db.query(
                            "UPDATE limpeza_posts SET likes = likes - 1 WHERE id = ?",
                            [postId],
                            (err, updateResult) => {
                                if (err) {
                                    console.log("❌ Erro ao atualizar contador:", err);
                                    return res.json({ success: false, error: "Erro ao atualizar contador" });
                                }
                                
                                db.query(
                                    "SELECT likes FROM limpeza_posts WHERE id = ?",
                                    [postId],
                                    (err, selectResult) => {
                                        if (err) {
                                            console.log("❌ Erro ao buscar likes atualizados:", err);
                                            return res.json({ success: false });
                                        }
                                        
                                        const novosLikes = selectResult[0]?.likes || 0;
                                        
                                        res.json({ 
                                            success: true, 
                                            likes: novosLikes,
                                            liked: false 
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            } else {
                db.query(
                    "INSERT INTO likes (user, limpeza_id) VALUES (?, ?)",
                    [user, postId],
                    (err, insertResult) => {
                        if (err) {
                            console.log("❌ Erro ao adicionar like:", err);
                            
                            if (err.code === 'ER_DUP_ENTRY') {
                                return res.json({ success: false, error: "Like já existe" });
                            }
                            
                            return res.json({ success: false, error: "Erro ao adicionar like" });
                        }
                        
                        db.query(
                            "UPDATE limpeza_posts SET likes = likes + 1 WHERE id = ?",
                            [postId],
                            (err, updateResult) => {
                                if (err) {
                                    console.log("❌ Erro ao atualizar contador:", err);
                                    return res.json({ success: false, error: "Erro ao atualizar contador" });
                                }
                                
                                db.query(
                                    "SELECT likes FROM limpeza_posts WHERE id = ?",
                                    [postId],
                                    (err, selectResult) => {
                                        if (err) {
                                            console.log("❌ Erro ao buscar likes atualizados:", err);
                                            return res.json({ success: false });
                                        }
                                        
                                        const novosLikes = selectResult[0]?.likes || 0;
                                        
                                        res.json({ 
                                            success: true, 
                                            likes: novosLikes,
                                            liked: true 
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            }
        }
    );
});

// ===== ROTA PARA VERIFICAR LIKES DO USUÁRIO NA LIMPEZA =====

app.get("/api/likes/limpeza/:usuario", (req, res) => {
    if (!req.session.user || req.session.user !== req.params.usuario) {
        return res.json({ success: false, error: "Não autorizado" });
    }
    
    const usuario = req.params.usuario;
    
    db.query(
        "SELECT limpeza_id FROM likes WHERE user = ? AND limpeza_id IS NOT NULL",
        [usuario],
        (err, result) => {
            if (err) {
                console.log("❌ Erro ao buscar likes do usuário:", err);
                return res.json({ success: false, error: "Erro ao buscar likes" });
            }
            
            const likes = result.map(row => row.limpeza_id);
            res.json({ success: true, likes: likes });
        }
    );
});

// ===== ROTA PRINCIPAL DO PÁTIO =====

app.get("/patio", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    db.query(
        "SELECT cargo FROM usuarios WHERE user=?",
        [req.session.user],
        (err, userResult) => {
            if (err || !userResult || userResult.length === 0) {
                return res.redirect("/");
            }
            
            const userCargo = userResult[0].cargo;
            
            db.query(
                `SELECT p.*, u.cargo as autor_cargo 
                 FROM patio_posts p
                 JOIN usuarios u ON p.user = u.user
                 ORDER BY p.created_at DESC`,
                (err, posts) => {
                    if (err) {
                        console.log("Erro ao carregar posts do pátio:", err);
                        return res.send(layout("Erro", `
                        <div class="feed-container">
                            <h2>Erro ao carregar posts</h2>
                            <div class="alert alert-error">
                                Ocorreu um erro ao carregar os posts. Tente novamente mais tarde.
                            </div>
                        </div>
                        `, req.session.user, userCargo));
                    }
                    
                    let postsHtml = '';
                    
                    if (posts && posts.length > 0) {
                        for (let post of posts) {
                            postsHtml += gerarPostPatioHtml(post, req.session.user, userCargo);
                        }
                    } else {
                        postsHtml = '<p style="text-align: center; color: #666; padding: 40px;">Nenhum post publicado ainda.</p>';
                    }
                    
                    const podePublicar = userCargo && userCargo.includes('Cuidador Patio');
                    
                    let formularioPublicacao = '';
                    
                    if (podePublicar) {
                        formularioPublicacao = `
                        <div class="post-form">
                            <h3>🏃 Publicar Post - Pátio/Manutenção</h3>
                            
                            <div class="tipo-selector">
                                <button class="tipo-btn active" id="btn-texto" onclick="selecionarTipo('texto')">📝 Texto</button>
                                <button class="tipo-btn" id="btn-foto" onclick="selecionarTipo('foto')">📷 Foto</button>
                                <button class="tipo-btn" id="btn-video" onclick="selecionarTipo('video')">🎥 Vídeo</button>
                                <button class="tipo-btn" id="btn-pdf" onclick="selecionarTipo('pdf')">📎 PDF</button>
                            </div>
                            
                            <form method="post" action="/publicar-pat" enctype="multipart/form-data" id="post-form">
                                <div class="post-input" id="input-texto">
                                    <input type="text" name="titulo" id="titulo-texto" placeholder="Título do post" required>
                                    <textarea name="conteudo" id="conteudo-texto" placeholder="Conteúdo do post..." rows="4"></textarea>
                                </div>
                                
                                <div class="post-input hidden" id="input-foto">
                                    <input type="text" name="titulo" id="titulo-foto" placeholder="Título do post">
                                    <input type="file" name="arquivo" id="arquivo-foto" accept="image/*">
                                    <textarea name="conteudo" id="conteudo-foto" placeholder="Descrição da imagem" rows="2"></textarea>
                                </div>
                                
                                <div class="post-input hidden" id="input-video">
                                    <input type="text" name="titulo" id="titulo-video" placeholder="Título do post">
                                    <input type="file" name="arquivo" id="arquivo-video" accept="video/*">
                                    <textarea name="conteudo" id="conteudo-video" placeholder="Descrição do vídeo" rows="2"></textarea>
                                </div>
                                
                                <div class="post-input hidden" id="input-pdf">
                                    <input type="text" name="titulo" id="titulo-pdf" placeholder="Título do post">
                                    <input type="file" name="arquivo" id="arquivo-pdf" accept=".pdf">
                                    <textarea name="conteudo" id="conteudo-pdf" placeholder="Descrição do PDF" rows="2"></textarea>
                                    <small style="color: #666;">Selecione apenas arquivos PDF</small>
                                </div>
                                
                                <input type="hidden" name="tipo" id="tipo-post" value="texto">
                                <button type="submit" style="width: 100%; margin-top: 15px;">Publicar</button>
                            </form>
                        </div>
                        `;
                    }
                    
                    let mensagem = '';
                    if (req.query.erro) {
                        if (req.query.erro === 'arquivo_vazio') {
                            mensagem = '<div class="alert alert-error">❌ Selecione um arquivo para publicar!</div>';
                        } else if (req.query.erro === 'texto_vazio') {
                            mensagem = '<div class="alert alert-error">❌ Escreva algo para publicar!</div>';
                        } else if (req.query.erro === 'titulo_vazio') {
                            mensagem = '<div class="alert alert-error">❌ Digite um título para o post!</div>';
                        } else if (req.query.erro === 'banco') {
                            mensagem = '<div class="alert alert-error">❌ Erro ao salvar no banco de dados!</div>';
                        } else if (req.query.erro === 'pdf_invalido') {
                            mensagem = '<div class="alert alert-error">❌ Arquivo inválido! Selecione apenas PDFs.</div>';
                        }
                    } else if (req.query.sucesso === 'post_criado') {
                        mensagem = '<div class="alert alert-success">✅ Post publicado com sucesso!</div>';
                    }
                    
                    const conteudo = `
                    <div class="feed-container">
                        <h2>🏃 Pátio/Manutenção</h2>
                        <p style="text-align: center; color: #666; margin-bottom: 20px;">Comunicados e informações sobre o pátio e manutenção</p>
                        
                        ${mensagem}
                        
                        ${formularioPublicacao}
                        
                        <div id="posts-container">
                            ${postsHtml}
                        </div>
                    </div>
                    
                    <script>
                        const usuarioAtual = '${req.session.user}';
                        
                        function selecionarTipo(tipo) {
                            document.getElementById('tipo-post').value = tipo;
                            
                            document.querySelectorAll('.tipo-btn').forEach(btn => {
                                btn.classList.remove('active');
                            });
                            document.getElementById('btn-' + tipo).classList.add('active');
                            
                            document.querySelectorAll('.post-input').forEach(el => {
                                el.classList.add('hidden');
                                el.querySelectorAll('input, textarea').forEach(campo => {
                                    campo.removeAttribute('required');
                                    if (campo.type === 'file') {
                                        campo.value = '';
                                    }
                                });
                            });
                            
                            const inputToShow = document.getElementById('input-' + tipo);
                            if (inputToShow) {
                                inputToShow.classList.remove('hidden');
                                
                                if (tipo === 'texto') {
                                    document.getElementById('titulo-texto').setAttribute('required', 'required');
                                } else if (tipo === 'foto') {
                                    document.getElementById('titulo-foto').setAttribute('required', 'required');
                                    document.getElementById('arquivo-foto').setAttribute('required', 'required');
                                } else if (tipo === 'video') {
                                    document.getElementById('titulo-video').setAttribute('required', 'required');
                                    document.getElementById('arquivo-video').setAttribute('required', 'required');
                                } else if (tipo === 'pdf') {
                                    document.getElementById('titulo-pdf').setAttribute('required', 'required');
                                    document.getElementById('arquivo-pdf').setAttribute('required', 'required');
                                }
                            }
                        }
                        
                        function likePatio(postId) {
                            const btn = document.querySelector(\`.like-btn[data-post="\${postId}"]\`);
                            
                            btn.disabled = true;
                            btn.style.opacity = '0.7';
                            
                            fetch('/like/pat/' + postId, { 
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                }
                            })
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success) {
                                        document.getElementById('likes-' + postId).textContent = data.likes;
                                        
                                        if (data.liked) {
                                            btn.classList.add('liked');
                                            localStorage.setItem(\`liked_patio_\${postId}_\${usuarioAtual}\`, 'true');
                                            btn.style.transform = 'scale(1.2)';
                                            setTimeout(() => {
                                                btn.style.transform = 'scale(1)';
                                            }, 200);
                                        } else {
                                            btn.classList.remove('liked');
                                            localStorage.removeItem(\`liked_patio_\${postId}_\${usuarioAtual}\`);
                                        }
                                    } else {
                                        alert("Erro ao processar like");
                                    }
                                })
                                .catch(err => {
                                    console.error('Erro:', err);
                                    alert("Erro de conexão");
                                })
                                .finally(() => {
                                    btn.disabled = false;
                                    btn.style.opacity = '1';
                                });
                        }
                        
                        function carregarLikesUsuario() {
                            fetch('/api/likes/pat/' + usuarioAtual)
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success && data.likes) {
                                        data.likes.forEach(postId => {
                                            const btn = document.querySelector(\`.like-btn[data-post="\${postId}"]\`);
                                            if (btn) {
                                                btn.classList.add('liked');
                                                localStorage.setItem(\`liked_patio_\${postId}_\${usuarioAtual}\`, 'true');
                                            }
                                        });
                                    }
                                })
                                .catch(err => console.error('Erro ao carregar likes:', err));
                        }
                        
                        function editarPost(postId) {
                            document.getElementById('post-content-' + postId).classList.add('hidden');
                            document.getElementById('edit-form-' + postId).classList.remove('hidden');
                        }
                        
                        function cancelarEdicao(postId) {
                            document.getElementById('post-content-' + postId).classList.remove('hidden');
                            document.getElementById('edit-form-' + postId).classList.add('hidden');
                        }
                        
                        document.addEventListener('DOMContentLoaded', function() {
                            selecionarTipo('texto');
                            carregarLikesUsuario();
                        });
                    </script>
                    `;
                    
                    res.send(layout("Pátio/Manutenção", conteudo, req.session.user, userCargo));
                }
            );
        }
    );
});

// ===== ROTA PARA PUBLICAR NO PÁTIO =====

app.post("/publicar-pat", upload.single('arquivo'), (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    db.query("SELECT cargo FROM usuarios WHERE user=?", [req.session.user], (err, result) => {
        if (err || !result || result.length === 0) {
            return res.redirect("/patio?erro=permissao");
        }
        
        const cargo = result[0].cargo;
        if (!cargo || !cargo.includes('Cuidador Patio')) {
            return res.redirect("/patio?erro=permissao");
        }
        
        let { titulo, conteudo, tipo } = req.body;
        const arquivo = req.file ? req.file.filename : null;
        
        if (Array.isArray(titulo)) {
            titulo = titulo.find(t => t && t.trim() !== '') || '';
        }
        
        if (Array.isArray(conteudo)) {
            conteudo = conteudo.find(c => c && c.trim() !== '') || '';
        }
        
        if (!titulo || !titulo.trim()) {
            return res.redirect("/patio?erro=titulo_vazio");
        }
        
        if (tipo === 'texto' && (!conteudo || !conteudo.trim())) {
            return res.redirect("/patio?erro=texto_vazio");
        }
        
        if ((tipo === 'foto' || tipo === 'video' || tipo === 'pdf') && !arquivo) {
            return res.redirect("/patio?erro=arquivo_vazio");
        }
        
        if (tipo === 'pdf' && arquivo) {
            const extensao = path.extname(arquivo).toLowerCase();
            if (extensao !== '.pdf') {
                return res.redirect("/patio?erro=pdf_invalido");
            }
        }
        
        const query = "INSERT INTO patio_posts (user, titulo, conteudo, tipo, arquivo) VALUES (?, ?, ?, ?, ?)";
        const valores = [
            req.session.user, 
            titulo,
            conteudo || null, 
            tipo, 
            arquivo || null
        ];
        
        db.query(query, valores, (err, result) => {
            if (err) {
                console.log("❌ ERRO DETALHADO NO BANCO DE DADOS:", err);
                return res.redirect("/patio?erro=banco");
            }
            
            console.log("✅ Post do pátio criado com sucesso! ID:", result.insertId);
            res.redirect("/patio?sucesso=post_criado");
        });
    });
});

// ===== ROTA PARA LIKES NO PÁTIO =====

app.post("/like/pat/:postId", (req, res) => {
    if (!req.session.user) {
        return res.json({ success: false, error: "Não logado" });
    }
    
    const postId = req.params.postId;
    const user = req.session.user;
    
    console.log(`🔄 Processando like no pátio ${postId} pelo usuário ${user}`);
    
    db.query(
        "SELECT * FROM likes WHERE user = ? AND patio_id = ?",
        [user, postId],
        (err, result) => {
            if (err) {
                console.log("❌ Erro ao verificar like:", err);
                return res.json({ success: false, error: "Erro ao verificar like" });
            }
            
            const jaCurtiu = result && result.length > 0;
            
            if (jaCurtiu) {
                db.query(
                    "DELETE FROM likes WHERE user = ? AND patio_id = ?",
                    [user, postId],
                    (err, deleteResult) => {
                        if (err) {
                            console.log("❌ Erro ao remover like:", err);
                            return res.json({ success: false, error: "Erro ao remover like" });
                        }
                        
                        db.query(
                            "UPDATE patio_posts SET likes = likes - 1 WHERE id = ?",
                            [postId],
                            (err, updateResult) => {
                                if (err) {
                                    console.log("❌ Erro ao atualizar contador:", err);
                                    return res.json({ success: false, error: "Erro ao atualizar contador" });
                                }
                                
                                db.query(
                                    "SELECT likes FROM patio_posts WHERE id = ?",
                                    [postId],
                                    (err, selectResult) => {
                                        if (err) {
                                            console.log("❌ Erro ao buscar likes atualizados:", err);
                                            return res.json({ success: false });
                                        }
                                        
                                        const novosLikes = selectResult[0]?.likes || 0;
                                        
                                        res.json({ 
                                            success: true, 
                                            likes: novosLikes,
                                            liked: false 
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            } else {
                db.query(
                    "INSERT INTO likes (user, patio_id) VALUES (?, ?)",
                    [user, postId],
                    (err, insertResult) => {
                        if (err) {
                            console.log("❌ Erro ao adicionar like:", err);
                            
                            if (err.code === 'ER_DUP_ENTRY') {
                                return res.json({ success: false, error: "Like já existe" });
                            }
                            
                            return res.json({ success: false, error: "Erro ao adicionar like" });
                        }
                        
                        db.query(
                            "UPDATE patio_posts SET likes = likes + 1 WHERE id = ?",
                            [postId],
                            (err, updateResult) => {
                                if (err) {
                                    console.log("❌ Erro ao atualizar contador:", err);
                                    return res.json({ success: false, error: "Erro ao atualizar contador" });
                                }
                                
                                db.query(
                                    "SELECT likes FROM patio_posts WHERE id = ?",
                                    [postId],
                                    (err, selectResult) => {
                                        if (err) {
                                            console.log("❌ Erro ao buscar likes atualizados:", err);
                                            return res.json({ success: false });
                                        }
                                        
                                        const novosLikes = selectResult[0]?.likes || 0;
                                        
                                        res.json({ 
                                            success: true, 
                                            likes: novosLikes,
                                            liked: true 
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            }
        }
    );
});

// ===== ROTA PARA VERIFICAR LIKES DO USUÁRIO NO PÁTIO =====

app.get("/api/likes/pat/:usuario", (req, res) => {
    if (!req.session.user || req.session.user !== req.params.usuario) {
        return res.json({ success: false, error: "Não autorizado" });
    }
    
    const usuario = req.params.usuario;
    
    db.query(
        "SELECT patio_id FROM likes WHERE user = ? AND patio_id IS NOT NULL",
        [usuario],
        (err, result) => {
            if (err) {
                console.log("❌ Erro ao buscar likes do usuário:", err);
                return res.json({ success: false, error: "Erro ao buscar likes" });
            }
            
            const likes = result.map(row => row.patio_id);
            res.json({ success: true, likes: likes });
        }
    );
});

// ===== ROTAS DO FEED =====

app.get("/turma/:turma", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    const turma = req.params.turma;
    
    let mensagem = '';
    if (req.query.erro) {
        if (req.query.erro === 'arquivo_vazio') {
            mensagem = '<div class="alert alert-error">❌ Selecione um arquivo para publicar!</div>';
        } else if (req.query.erro === 'texto_vazio') {
            mensagem = '<div class="alert alert-error">❌ Escreva algo para publicar!</div>';
        } else if (req.query.erro === 'youtube_vazio') {
            mensagem = '<div class="alert alert-error">❌ Digite a URL do YouTube!</div>';
        } else if (req.query.erro === 'banco') {
            mensagem = '<div class="alert alert-error">❌ Erro ao salvar no banco de dados!</div>';
        } else if (req.query.erro === 'pdf_invalido') {
            mensagem = '<div class="alert alert-error">❌ Arquivo inválido! Selecione apenas PDFs.</div>';
        } else if (req.query.erro === 'upload_falhou') {
            mensagem = '<div class="alert alert-error">❌ Erro no upload do arquivo!</div>';
        }
    } else if (req.query.sucesso === 'post_criado') {
        mensagem = '<div class="alert alert-success">✅ Post publicado com sucesso!</div>';
    }
    
    db.query(
        "SELECT cargo, turma FROM usuarios WHERE user=?",
        [req.session.user],
        (err, userResult) => {
            if (err || !userResult || userResult.length === 0) {
                return res.redirect("/");
            }
            
            const userCargo = userResult[0].cargo;
            const userTurma = userResult[0].turma;
            
            db.query(
                `SELECT p.*, u.cargo as autor_cargo 
                 FROM posts p
                 JOIN usuarios u ON p.user = u.user
                 WHERE p.turma = ?
                 ORDER BY p.created_at DESC`,
                [turma],
                (err, posts) => {
                    if (err) {
                        console.log(err);
                        return res.send(layout("Erro", "<h2>Erro ao carregar posts</h2>", req.session.user, userCargo, userTurma));
                    }
                    
                    let postsHtml = '';
                    
                    if (posts && posts.length > 0) {
                        for (let post of posts) {
                            postsHtml += gerarPostHtml(post, req.session.user, userCargo, turma);
                        }
                    } else {
                        postsHtml = '<p style="text-align: center; color: #666; padding: 40px;">Nenhuma publicação ainda. Seja o primeiro a postar!</p>';
                    }
                    
                    const conteudo = `
                    <div class="feed-container">
                        <h2>🎯 Turma ${turma} - Feed</h2>
                        
                        ${mensagem}
                        
                        <div class="post-form">
                            <h3>Criar publicação</h3>
                            
                            <div class="tipo-selector">
                                <button class="tipo-btn active" id="btn-texto" onclick="selecionarTipo('texto')">📝 Texto</button>
                                <button class="tipo-btn" id="btn-foto" onclick="selecionarTipo('foto')">📷 Foto</button>
                                <button class="tipo-btn" id="btn-video" onclick="selecionarTipo('video')">🎥 Vídeo</button>
                                <button class="tipo-btn" id="btn-youtube" onclick="selecionarTipo('youtube')">▶️ YouTube</button>
                                <button class="tipo-btn" id="btn-pdf" onclick="selecionarTipo('pdf')">📎 PDF</button>
                            </div>
                            
                            <form method="post" action="/postar/${turma}" enctype="multipart/form-data" id="post-form">
                                <div class="post-input" id="input-texto">
                                    <textarea name="conteudo" placeholder="O que você está pensando?" rows="4"></textarea>
                                </div>
                                
                                <div class="post-input hidden" id="input-foto">
                                    <input type="file" name="arquivo" accept="image/*">
                                </div>
                                
                                <div class="post-input hidden" id="input-video">
                                    <input type="file" name="arquivo" accept="video/*">
                                </div>
                                
                                <div class="post-input hidden" id="input-youtube">
                                    <input type="text" name="youtube_url" placeholder="URL do YouTube (ex: https://youtu.be/... ou https://youtube.com/watch?v=...)">
                                </div>
                                
                                <div class="post-input hidden" id="input-pdf">
                                    <input type="file" name="arquivo" accept=".pdf" id="pdf-input">
                                    <small style="color: #666;">Selecione apenas arquivos PDF</small>
                                </div>
                                
                                <input type="hidden" name="tipo" id="tipo-post" value="texto">
                                <button type="submit" style="width: 100%; margin-top: 15px;">Publicar</button>
                            </form>
                        </div>
                        
                        <div id="posts-container">
                            ${postsHtml}
                        </div>
                    </div>
                    
                    <script>
                        function selecionarTipo(tipo) {
                            document.getElementById('tipo-post').value = tipo;
                            
                            document.querySelectorAll('.tipo-btn').forEach(btn => {
                                btn.classList.remove('active');
                            });
                            document.getElementById('btn-' + tipo).classList.add('active');
                            
                            document.querySelectorAll('.post-input').forEach(el => {
                                el.classList.add('hidden');
                                el.querySelectorAll('input, textarea').forEach(campo => {
                                    campo.removeAttribute('required');
                                    if (campo.type === 'file') {
                                        campo.value = '';
                                    }
                                });
                            });
                            
                            const inputToShow = document.getElementById('input-' + tipo);
                            if (inputToShow) {
                                inputToShow.classList.remove('hidden');
                                
                                if (tipo === 'foto' || tipo === 'video' || tipo === 'pdf') {
                                    inputToShow.querySelector('input[type="file"]').setAttribute('required', 'required');
                                } else if (tipo === 'youtube') {
                                    inputToShow.querySelector('input[type="text"]').setAttribute('required', 'required');
                                }
                            }
                        }
                        
                        function likePost(postId) {
                            fetch('/like/post/' + postId, { method: 'POST' })
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success) {
                                        document.getElementById('likes-' + postId).textContent = data.likes;
                                        const btn = document.querySelector('.like-btn[data-post="' + postId + '"]');
                                        btn.classList.toggle('liked');
                                    }
                                })
                                .catch(err => console.error('Erro:', err));
                        }
                        
                        function mostrarFormComentario(postId) {
                            const form = document.getElementById('comentario-form-' + postId);
                            form.classList.toggle('hidden');
                        }
                        
                        function likeComentario(comentarioId) {
                            fetch('/like/comentario/' + comentarioId, { method: 'POST' })
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success) {
                                        document.getElementById('comentario-likes-' + comentarioId).textContent = data.likes;
                                    }
                                })
                                .catch(err => console.error('Erro:', err));
                        }
                        
                        function editarPost(postId) {
                            document.getElementById('post-content-' + postId).classList.add('hidden');
                            document.getElementById('edit-form-' + postId).classList.remove('hidden');
                        }
                        
                        function cancelarEdicao(postId) {
                            document.getElementById('post-content-' + postId).classList.remove('hidden');
                            document.getElementById('edit-form-' + postId).classList.add('hidden');
                        }
                    </script>
                    `;
                    
                    res.send(layout(`Turma ${turma}`, conteudo, req.session.user, userCargo, userTurma));
                }
            );
        }
    );
});

function gerarPostHtml(post, usuarioLogado, cargoUsuario, turmaAtual) {
    const podeEditar = (post.user === usuarioLogado) || 
                       (cargoUsuario && (cargoUsuario.includes('Diretor') || 
                        cargoUsuario.includes('Coordenador') || 
                        cargoUsuario.includes('Professor')));
    
    let conteudoPost = '';
    const dataPost = new Date(post.created_at).toLocaleString('pt-BR');
    
    if (post.tipo === 'texto') {
        conteudoPost = `<p style="font-size: 1.1em; line-height: 1.6;">${post.conteudo}</p>`;
    } else if (post.tipo === 'foto') {
        conteudoPost = `
            <div style="text-align: center;">
                <img src="/uploads/${post.arquivo}" class="post-media" style="max-height: 400px;">
                ${post.conteudo ? `<p style="margin-top: 10px;">${post.conteudo}</p>` : ''}
            </div>
        `;
    } else if (post.tipo === 'video') {
        conteudoPost = `
            <div style="text-align: center;">
                <video controls class="post-media" style="max-height: 400px;">
                    <source src="/uploads/${post.arquivo}">
                </video>
                ${post.conteudo ? `<p style="margin-top: 10px;">${post.conteudo}</p>` : ''}
            </div>
        `;
    } else if (post.tipo === 'youtube') {
        let videoId = '';
        if (post.youtube_url.includes('youtu.be')) {
            videoId = post.youtube_url.split('youtu.be/')[1];
        } else if (post.youtube_url.includes('v=')) {
            videoId = post.youtube_url.split('v=')[1].split('&')[0];
        }
        
        conteudoPost = `
            <div style="text-align: center;">
                <iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" 
                        frameborder="0" allowfullscreen class="post-media" style="max-width: 100%;"></iframe>
                ${post.conteudo ? `<p style="margin-top: 10px;">${post.conteudo}</p>` : ''}
            </div>
        `;
    } else if (post.tipo === 'pdf') {
        conteudoPost = `
            <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                <a href="/uploads/${post.arquivo}" target="_blank" style="font-size: 1.2em; display: block;">
                    📄 Visualizar PDF
                </a>
                ${post.conteudo ? `<p style="margin-top: 10px;">${post.conteudo}</p>` : ''}
            </div>
        `;
    }
    
    return `
    <div class="post" id="post-${post.id}">
        <div class="post-header">
            <span class="post-author">👤 ${post.user} (${post.autor_cargo})</span>
            <span class="post-date">📅 ${dataPost}</span>
        </div>
        
        <div class="post-content" id="post-content-${post.id}">
            ${conteudoPost}
        </div>
        
        ${podeEditar ? `
        <div class="edit-form hidden" id="edit-form-${post.id}">
            <form method="post" action="/editar-post/${post.id}?turma=${turmaAtual}" enctype="multipart/form-data">
                <textarea name="conteudo" rows="3" placeholder="Conteúdo...">${post.conteudo || ''}</textarea>
                <input type="file" name="arquivo" accept="image/*,video/*,.pdf">
                <input type="text" name="youtube_url" placeholder="URL do YouTube" value="${post.youtube_url || ''}">
                <div style="display: flex; gap: 10px;">
                    <button type="submit">Salvar</button>
                    <button type="button" onclick="cancelarEdicao(${post.id})" style="background: #666;">Cancelar</button>
                </div>
            </form>
        </div>
        ` : ''}
        
        <div class="post-actions">
            <button class="action-btn like-btn" data-post="${post.id}" onclick="likePost(${post.id})">
                👍 <span id="likes-${post.id}">${post.likes || 0}</span>
            </button>
            
            <button class="action-btn" onclick="mostrarFormComentario(${post.id})">
                💬 Comentar
            </button>
            
            ${podeEditar ? `
            <button class="action-btn" onclick="editarPost(${post.id})">✏️ Editar</button>
            <a href="/deletar-post/${post.id}?turma=${turmaAtual}" class="action-btn" onclick="return confirm('Tem certeza que deseja deletar esta publicação?')">🗑️ Deletar</a>
            ` : ''}
        </div>
        
        <div class="comentarios-section" id="comentarios-${post.id}">
            <div class="comentarios-lista" id="comentarios-lista-${post.id}">
                ${carregarComentarios(post.id, usuarioLogado, turmaAtual)}
            </div>
            
            <div class="comentario-form hidden" id="comentario-form-${post.id}">
                <form method="post" action="/comentar/${post.id}?turma=${turmaAtual}">
                    <input type="text" name="comentario" placeholder="Escreva um comentário..." required>
                    <button type="submit">Comentar</button>
                </form>
            </div>
        </div>
    </div>
    `;
}

function carregarComentarios(postId, usuarioLogado, turmaAtual) {
    return '<p style="color: #666; font-size: 0.9em;">Carregando comentários...</p>';
}

// ===== ROTAS PARA POSTS =====

app.post("/postar/:turma", upload.single('arquivo'), (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    const turma = req.params.turma;
    const { conteudo, tipo, youtube_url } = req.body;
    const arquivo = req.file ? req.file.filename : null;
    
    if (tipo === 'texto' && (!conteudo || !conteudo.trim())) {
        return res.redirect(`/turma/${turma}?erro=texto_vazio`);
    }
    
    if (tipo === 'youtube' && (!youtube_url || !youtube_url.trim())) {
        return res.redirect(`/turma/${turma}?erro=youtube_vazio`);
    }
    
    if ((tipo === 'foto' || tipo === 'video' || tipo === 'pdf') && !arquivo) {
        return res.redirect(`/turma/${turma}?erro=arquivo_vazio`);
    }
    
    if (tipo === 'pdf' && arquivo) {
        const extensao = path.extname(arquivo).toLowerCase();
        if (extensao !== '.pdf') {
            return res.redirect(`/turma/${turma}?erro=pdf_invalido`);
        }
    }
    
    const query = "INSERT INTO posts (user, turma, conteudo, tipo, arquivo, youtube_url) VALUES (?, ?, ?, ?, ?, ?)";
    const valores = [
        req.session.user, 
        turma, 
        conteudo || null, 
        tipo, 
        arquivo, 
        youtube_url || null
    ];
    
    db.query(query, valores, (err, result) => {
        if (err) {
            console.log("Erro no banco de dados:", err);
            return res.redirect(`/turma/${turma}?erro=banco`);
        }
        
        io.emit('novo-post', {
            id: result.insertId,
            user: req.session.user,
            turma: turma,
            tipo: tipo
        });
        
        res.redirect(`/turma/${turma}?sucesso=post_criado`);
    });
});

app.post("/editar-post/:postId", upload.single('arquivo'), (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    const postId = req.params.postId;
    const turma = req.query.turma;
    const { conteudo, youtube_url } = req.body;
    const arquivo = req.file ? req.file.filename : null;
    
    db.query("SELECT turma FROM posts WHERE id = ?", [postId], (err, result) => {
        if (err) {
            console.log(err);
            return res.redirect(`/turma/${turma || '1A'}`);
        }
        
        const turmaPost = result[0]?.turma || turma;
        
        let query = "UPDATE posts SET conteudo = ?";
        let valores = [conteudo || null];
        
        if (arquivo) {
            query += ", arquivo = ?";
            valores.push(arquivo);
        }
        
        if (youtube_url) {
            query += ", youtube_url = ?";
            valores.push(youtube_url || null);
        }
        
        query += " WHERE id = ? AND user = ?";
        valores.push(postId, req.session.user);
        
        db.query(query, valores, (err, result) => {
            if (err) {
                console.log(err);
            }
            res.redirect(`/turma/${turmaPost}`);
        });
    });
});

app.get("/deletar-post/:postId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    const postId = req.params.postId;
    const turma = req.query.turma;
    
    db.query("SELECT turma FROM posts WHERE id = ?", [postId], (err, result) => {
        if (err) {
            console.log(err);
            return res.redirect(`/turma/${turma || '1A'}`);
        }
        
        const turmaPost = result[0]?.turma || turma;
        
        db.query("DELETE FROM posts WHERE id = ? AND user = ?", [postId, req.session.user], (err, result) => {
            if (err) {
                console.log(err);
            }
            res.redirect(`/turma/${turmaPost}`);
        });
    });
});

// ===== ROTAS PARA COMENTÁRIOS =====

app.post("/comentar/:postId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    const postId = req.params.postId;
    const turma = req.query.turma;
    const { comentario } = req.body;
    
    if (!comentario || !comentario.trim()) {
        return res.redirect(`/turma/${turma}`);
    }
    
    db.query("SELECT turma FROM posts WHERE id = ?", [postId], (err, result) => {
        if (err) {
            console.log(err);
            return res.redirect(`/turma/${turma || '1A'}`);
        }
        
        const turmaPost = result[0]?.turma || turma;
        
        db.query(
            "INSERT INTO comentarios (post_id, user, comentario) VALUES (?, ?, ?)",
            [postId, req.session.user, comentario],
            (err, result) => {
                if (err) {
                    console.log(err);
                }
                res.redirect(`/turma/${turmaPost}`);
            }
        );
    });
});

app.get("/deletar-comentario/:comentarioId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    const comentarioId = req.params.comentarioId;
    const turma = req.query.turma;
    
    db.query(
        "SELECT c.post_id, p.turma FROM comentarios c JOIN posts p ON c.post_id = p.id WHERE c.id = ?",
        [comentarioId],
        (err, result) => {
            if (err) {
                console.log(err);
                return res.redirect(`/turma/${turma || '1A'}`);
            }
            
            const turmaPost = result[0]?.turma || turma;
            
            db.query(
                "DELETE FROM comentarios WHERE id = ? AND user = ?",
                [comentarioId, req.session.user],
                (err, result) => {
                    if (err) {
                        console.log(err);
                    }
                    res.redirect(`/turma/${turmaPost}`);
                }
            );
        }
    );
});

// ===== ROTAS PARA LIKES =====

app.post("/like/post/:postId", (req, res) => {
    if (!req.session.user) {
        return res.json({ success: false, error: "Não logado" });
    }
    
    const postId = req.params.postId;
    const user = req.session.user;
    
    db.query(
        "SELECT * FROM likes WHERE user = ? AND post_id = ?",
        [user, postId],
        (err, result) => {
            if (err) {
                console.log(err);
                return res.json({ success: false });
            }
            
            if (result && result.length > 0) {
                db.query(
                    "DELETE FROM likes WHERE user = ? AND post_id = ?",
                    [user, postId],
                    (err) => {
                        if (err) {
                            console.log(err);
                            return res.json({ success: false });
                        }
                        
                        db.query(
                            "UPDATE posts SET likes = likes - 1 WHERE id = ?",
                            [postId],
                            (err) => {
                                if (err) {
                                    console.log(err);
                                    return res.json({ success: false });
                                }
                                
                                db.query(
                                    "SELECT likes FROM posts WHERE id = ?",
                                    [postId],
                                    (err, result) => {
                                        if (err) {
                                            console.log(err);
                                            return res.json({ success: false });
                                        }
                                        res.json({ success: true, likes: result[0].likes });
                                    }
                                );
                            }
                        );
                    }
                );
            } else {
                db.query(
                    "INSERT INTO likes (user, post_id) VALUES (?, ?)",
                    [user, postId],
                    (err) => {
                        if (err) {
                            console.log(err);
                            return res.json({ success: false });
                        }
                        
                        db.query(
                            "UPDATE posts SET likes = likes + 1 WHERE id = ?",
                            [postId],
                            (err) => {
                                if (err) {
                                    console.log(err);
                                    return res.json({ success: false });
                                }
                                
                                db.query(
                                    "SELECT likes FROM posts WHERE id = ?",
                                    [postId],
                                    (err, result) => {
                                        if (err) {
                                            console.log(err);
                                            return res.json({ success: false });
                                        }
                                        res.json({ success: true, likes: result[0].likes });
                                    }
                                );
                            }
                        );
                    }
                );
            }
        }
    );
});

app.post("/like/comentario/:comentarioId", (req, res) => {
    if (!req.session.user) {
        return res.json({ success: false, error: "Não logado" });
    }
    
    const comentarioId = req.params.comentarioId;
    const user = req.session.user;
    
    db.query(
        "SELECT * FROM likes WHERE user = ? AND comentario_id = ?",
        [user, comentarioId],
        (err, result) => {
            if (err) {
                console.log(err);
                return res.json({ success: false });
            }
            
            if (result && result.length > 0) {
                db.query(
                    "DELETE FROM likes WHERE user = ? AND comentario_id = ?",
                    [user, comentarioId],
                    (err) => {
                        if (err) {
                            console.log(err);
                            return res.json({ success: false });
                        }
                        
                        db.query(
                            "UPDATE comentarios SET likes = likes - 1 WHERE id = ?",
                            [comentarioId],
                            (err) => {
                                if (err) {
                                    console.log(err);
                                    return res.json({ success: false });
                                }
                                
                                db.query(
                                    "SELECT likes FROM comentarios WHERE id = ?",
                                    [comentarioId],
                                    (err, result) => {
                                        if (err) {
                                            console.log(err);
                                            return res.json({ success: false });
                                        }
                                        res.json({ success: true, likes: result[0].likes });
                                    }
                                );
                            }
                        );
                    }
                );
            } else {
                db.query(
                    "INSERT INTO likes (user, comentario_id) VALUES (?, ?)",
                    [user, comentarioId],
                    (err) => {
                        if (err) {
                            console.log(err);
                            return res.json({ success: false });
                        }
                        
                        db.query(
                            "UPDATE comentarios SET likes = likes + 1 WHERE id = ?",
                            [comentarioId],
                            (err) => {
                                if (err) {
                                    console.log(err);
                                    return res.json({ success: false });
                                }
                                
                                db.query(
                                    "SELECT likes FROM comentarios WHERE id = ?",
                                    [comentarioId],
                                    (err, result) => {
                                        if (err) {
                                            console.log(err);
                                            return res.json({ success: false });
                                        }
                                        res.json({ success: true, likes: result[0].likes });
                                    }
                                );
                            }
                        );
                    }
                );
            }
        }
    );
});

// ===== ROTAS DA API DO CHAT =====

// ATUALIZADA: Agora retorna TODOS os usuários da mesma turma, com status online/offline
app.get("/api/contatos", (req, res) => {
    if (!req.session.user) {
        return res.json([]);
    }
    
    // Busca todos os usuários da mesma turma do usuário logado
    db.query(
        `SELECT user, cargo, turma, online, ultima_vez 
         FROM usuarios 
         WHERE turma = (SELECT turma FROM usuarios WHERE user = ?)
         ORDER BY online DESC, user ASC`,
        [req.session.user],
        (err, result) => {
            if (err) {
                console.log("Erro ao buscar contatos:", err);
                return res.json([]);
            }
            res.json(result);
        }
    );
});

app.get("/api/mensagens/geral", (req, res) => {
    if (!req.session.user) {
        return res.json([]);
    }
    
    db.query(
        `SELECT m.*, u.cargo 
         FROM mensagens m
         JOIN usuarios u ON m.remetente = u.user
         WHERE m.tipo = 'geral' AND m.turma = (SELECT turma FROM usuarios WHERE user = ?) AND m.deletada = FALSE
         ORDER BY m.created_at ASC LIMIT 50`,
        [req.session.user],
        (err, result) => {
            if (err) {
                console.log(err);
                return res.json([]);
            }
            
            db.query(
                "UPDATE mensagens SET lida = TRUE WHERE tipo = 'geral' AND turma = (SELECT turma FROM usuarios WHERE user = ?)",
                [req.session.user]
            );
            
            res.json(result);
        }
    );
});

app.get("/api/mensagens/privado/:contato", (req, res) => {
    if (!req.session.user) {
        return res.json([]);
    }
    
    const contato = req.params.contato;
    const usuario = req.session.user;
    
    db.query(
        `SELECT * FROM mensagens 
         WHERE ((remetente = ? AND destinatario = ?) OR (remetente = ? AND destinatario = ?))
         AND tipo = 'privado' AND deletada = FALSE
         ORDER BY created_at ASC LIMIT 50`,
        [usuario, contato, contato, usuario],
        (err, result) => {
            if (err) {
                console.log(err);
                return res.json([]);
            }
            
            db.query(
                "UPDATE mensagens SET lida = TRUE WHERE remetente = ? AND destinatario = ?",
                [contato, usuario]
            );
            
            res.json(result);
        }
    );
});

// ===== NOVAS ROTAS PARA O CHAT =====

// Editar mensagem
app.post("/api/mensagem/editar", (req, res) => {
    if (!req.session.user) {
        return res.json({ success: false, error: "Não logado" });
    }
    
    const { id, mensagem, tipo } = req.body;
    const usuario = req.session.user;
    
    if (!mensagem || !mensagem.trim()) {
        return res.json({ success: false, error: "Mensagem vazia" });
    }
    
    // Verificar se a mensagem pertence ao usuário
    db.query(
        "SELECT * FROM mensagens WHERE id = ? AND remetente = ? AND deletada = FALSE",
        [id, usuario],
        (err, result) => {
            if (err) {
                console.log("❌ Erro ao verificar mensagem:", err);
                return res.json({ success: false, error: "Erro ao verificar mensagem" });
            }
            
            if (!result || result.length === 0) {
                return res.json({ success: false, error: "Mensagem não encontrada ou sem permissão" });
            }
            
            // Atualizar a mensagem
            db.query(
                "UPDATE mensagens SET mensagem = ?, editada = TRUE WHERE id = ?",
                [mensagem, id],
                (err, result) => {
                    if (err) {
                        console.log("❌ Erro ao editar mensagem:", err);
                        return res.json({ success: false, error: "Erro ao editar mensagem" });
                    }
                    
                    // Buscar a mensagem atualizada para emitir via socket
                    db.query(
                        "SELECT * FROM mensagens WHERE id = ?",
                        [id],
                        (err, msgResult) => {
                            if (err) {
                                console.log("❌ Erro ao buscar mensagem atualizada:", err);
                                return res.json({ success: true });
                            }
                            
                            const msgAtualizada = msgResult[0];
                            msgAtualizada.editada = true;
                            
                            io.emit('mensagem-atualizada', msgAtualizada);
                            
                            res.json({ success: true });
                        }
                    );
                }
            );
        }
    );
});

// Deletar mensagem (soft delete)
app.post("/api/mensagem/deletar", (req, res) => {
    if (!req.session.user) {
        return res.json({ success: false, error: "Não logado" });
    }
    
    const { id, tipo } = req.body;
    const usuario = req.session.user;
    
    // Verificar se a mensagem pertence ao usuário
    db.query(
        "SELECT * FROM mensagens WHERE id = ? AND remetente = ? AND deletada = FALSE",
        [id, usuario],
        (err, result) => {
            if (err) {
                console.log("❌ Erro ao verificar mensagem:", err);
                return res.json({ success: false, error: "Erro ao verificar mensagem" });
            }
            
            if (!result || result.length === 0) {
                return res.json({ success: false, error: "Mensagem não encontrada ou sem permissão" });
            }
            
            // Marcar mensagem como deletada
            db.query(
                "UPDATE mensagens SET deletada = TRUE WHERE id = ?",
                [id],
                (err, result) => {
                    if (err) {
                        console.log("❌ Erro ao deletar mensagem:", err);
                        return res.json({ success: false, error: "Erro ao deletar mensagem" });
                    }
                    
                    io.emit('mensagem-deletada', { id: id, tipo: tipo });
                    
                    res.json({ success: true });
                }
            );
        }
    );
});

// ===== NOVAS ROTAS PARA RECADOS =====

// Rota principal de recados
app.get("/recados", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    db.query(
        "SELECT cargo, turma FROM usuarios WHERE user=?",
        [req.session.user],
        (err, userResult) => {
            if (err || !userResult || userResult.length === 0) {
                return res.redirect("/");
            }
            
            const userCargo = userResult[0].cargo;
            const userTurma = userResult[0].turma;
            
            // Verificar se o usuário pode publicar (diretor, vice, coordenador, professor)
            const podePublicar = userCargo && (
                userCargo.includes('Diretor') || 
                userCargo.includes('Vice Diretor') || 
                userCargo.includes('Coordenador') ||
                userCargo.includes('Professor')
            );
            
            let mensagem = '';
            if (req.query.erro) {
                if (req.query.erro === 'arquivo_vazio') {
                    mensagem = '<div class="alert alert-error">❌ Selecione um arquivo para publicar!</div>';
                } else if (req.query.erro === 'texto_vazio') {
                    mensagem = '<div class="alert alert-error">❌ Escreva algo para publicar!</div>';
                } else if (req.query.erro === 'titulo_vazio') {
                    mensagem = '<div class="alert alert-error">❌ Digite um título para o recado!</div>';
                } else if (req.query.erro === 'banco') {
                    mensagem = '<div class="alert alert-error">❌ Erro ao salvar no banco de dados!</div>';
                } else if (req.query.erro === 'pdf_invalido') {
                    mensagem = '<div class="alert alert-error">❌ Arquivo inválido! Selecione apenas PDFs.</div>';
                } else if (req.query.erro === 'youtube_invalido') {
                    mensagem = '<div class="alert alert-error">❌ URL do YouTube inválida!</div>';
                }
            } else if (req.query.sucesso === 'post_criado') {
                mensagem = '<div class="alert alert-success">✅ Recado publicado com sucesso!</div>';
            } else if (req.query.sucesso === 'post_editado') {
                mensagem = '<div class="alert alert-success">✅ Recado editado com sucesso!</div>';
            } else if (req.query.sucesso === 'post_deletado') {
                mensagem = '<div class="alert alert-success">✅ Recado deletado com sucesso!</div>';
            }
            
            db.query(
                `SELECT r.*, u.cargo as autor_cargo 
                 FROM recados_posts r
                 JOIN usuarios u ON r.user = u.user
                 ORDER BY r.created_at DESC`,
                (err, posts) => {
                    if (err) {
                        console.log("Erro ao carregar recados:", err);
                        return res.send(layout("Erro", `
                        <div class="feed-container">
                            <h2>Erro ao carregar recados</h2>
                            <div class="alert alert-error">
                                Ocorreu um erro ao carregar os recados. Tente novamente mais tarde.
                            </div>
                        </div>
                        `, req.session.user, userCargo, userTurma));
                    }
                    
                    let postsHtml = '';
                    
                    if (posts && posts.length > 0) {
                        for (let post of posts) {
                            postsHtml += gerarPostRecadoHtml(post, req.session.user, userCargo);
                        }
                    } else {
                        postsHtml = '<p style="text-align: center; color: #666; padding: 40px;">Nenhum recado publicado ainda.</p>';
                    }
                    
                    let formularioPublicacao = '';
                    
                    if (podePublicar) {
                        formularioPublicacao = `
                        <div class="post-form">
                            <h3>📢 Publicar Recado</h3>
                            
                            <div class="tipo-selector">
                                <button class="tipo-btn active" id="btn-texto" onclick="selecionarTipo('texto')">📝 Texto</button>
                                <button class="tipo-btn" id="btn-foto" onclick="selecionarTipo('foto')">📷 Foto</button>
                                <button class="tipo-btn" id="btn-video" onclick="selecionarTipo('video')">🎥 Vídeo</button>
                                <button class="tipo-btn" id="btn-youtube" onclick="selecionarTipo('youtube')">▶️ YouTube</button>
                                <button class="tipo-btn" id="btn-pdf" onclick="selecionarTipo('pdf')">📎 PDF</button>
                            </div>
                            
                            <form method="post" action="/publicar-recado" enctype="multipart/form-data" id="post-form">
                                <div class="post-input" id="input-texto">
                                    <input type="text" name="titulo" id="titulo-texto" placeholder="Título do recado" required>
                                    <textarea name="conteudo" id="conteudo-texto" placeholder="Conteúdo do recado..." rows="4"></textarea>
                                </div>
                                
                                <div class="post-input hidden" id="input-foto">
                                    <input type="text" name="titulo" id="titulo-foto" placeholder="Título do recado">
                                    <input type="file" name="arquivo" id="arquivo-foto" accept="image/*">
                                    <textarea name="conteudo" id="conteudo-foto" placeholder="Descrição da imagem (opcional)" rows="2"></textarea>
                                </div>
                                
                                <div class="post-input hidden" id="input-video">
                                    <input type="text" name="titulo" id="titulo-video" placeholder="Título do recado">
                                    <input type="file" name="arquivo" id="arquivo-video" accept="video/*">
                                    <textarea name="conteudo" id="conteudo-video" placeholder="Descrição do vídeo (opcional)" rows="2"></textarea>
                                </div>
                                
                                <div class="post-input hidden" id="input-youtube">
                                    <input type="text" name="titulo" id="titulo-youtube" placeholder="Título do recado">
                                    <input type="text" name="youtube_url" id="youtube-url" placeholder="URL do YouTube">
                                    <textarea name="conteudo" id="conteudo-youtube" placeholder="Descrição do vídeo (opcional)" rows="2"></textarea>
                                </div>
                                
                                <div class="post-input hidden" id="input-pdf">
                                    <input type="text" name="titulo" id="titulo-pdf" placeholder="Título do recado">
                                    <input type="file" name="arquivo" id="arquivo-pdf" accept=".pdf">
                                    <textarea name="conteudo" id="conteudo-pdf" placeholder="Descrição do PDF (opcional)" rows="2"></textarea>
                                    <small style="color: #666;">Selecione apenas arquivos PDF</small>
                                </div>
                                
                                <input type="hidden" name="tipo" id="tipo-post" value="texto">
                                <button type="submit" style="width: 100%; margin-top: 15px;">Publicar Recado</button>
                            </form>
                        </div>
                        `;
                    }
                    
                    const conteudo = `
                    <div class="feed-container">
                        <h2>📢 Recados Escolares</h2>
                        <p style="text-align: center; color: #666; margin-bottom: 20px;">Comunicados importantes da direção, coordenação e professores</p>
                        
                        ${mensagem}
                        
                        ${formularioPublicacao}
                        
                        <div id="posts-container">
                            ${postsHtml}
                        </div>
                    </div>
                    
                    <script>
                        const usuarioAtual = '${req.session.user}';
                        
                        function selecionarTipo(tipo) {
                            document.getElementById('tipo-post').value = tipo;
                            
                            document.querySelectorAll('.tipo-btn').forEach(btn => {
                                btn.classList.remove('active');
                            });
                            document.getElementById('btn-' + tipo).classList.add('active');
                            
                            document.querySelectorAll('.post-input').forEach(el => {
                                el.classList.add('hidden');
                                el.querySelectorAll('input, textarea').forEach(campo => {
                                    campo.removeAttribute('required');
                                    if (campo.type === 'file') {
                                        campo.value = '';
                                    }
                                });
                            });
                            
                            const inputToShow = document.getElementById('input-' + tipo);
                            if (inputToShow) {
                                inputToShow.classList.remove('hidden');
                                
                                if (tipo === 'texto') {
                                    document.getElementById('titulo-texto').setAttribute('required', 'required');
                                } else if (tipo === 'foto') {
                                    document.getElementById('titulo-foto').setAttribute('required', 'required');
                                    document.getElementById('arquivo-foto').setAttribute('required', 'required');
                                } else if (tipo === 'video') {
                                    document.getElementById('titulo-video').setAttribute('required', 'required');
                                    document.getElementById('arquivo-video').setAttribute('required', 'required');
                                } else if (tipo === 'youtube') {
                                    document.getElementById('titulo-youtube').setAttribute('required', 'required');
                                    document.getElementById('youtube-url').setAttribute('required', 'required');
                                } else if (tipo === 'pdf') {
                                    document.getElementById('titulo-pdf').setAttribute('required', 'required');
                                    document.getElementById('arquivo-pdf').setAttribute('required', 'required');
                                }
                            }
                        }
                        
                        function likeRecado(postId) {
                            const btn = document.querySelector(\`.like-btn[data-post="\${postId}"]\`);
                            
                            btn.disabled = true;
                            btn.style.opacity = '0.7';
                            
                            fetch('/like/recado/' + postId, { 
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                }
                            })
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success) {
                                        document.getElementById('likes-' + postId).textContent = data.likes;
                                        
                                        if (data.liked) {
                                            btn.classList.add('liked');
                                            localStorage.setItem(\`liked_recado_\${postId}_\${usuarioAtual}\`, 'true');
                                            btn.style.transform = 'scale(1.2)';
                                            setTimeout(() => {
                                                btn.style.transform = 'scale(1)';
                                            }, 200);
                                        } else {
                                            btn.classList.remove('liked');
                                            localStorage.removeItem(\`liked_recado_\${postId}_\${usuarioAtual}\`);
                                        }
                                    } else {
                                        alert("Erro ao processar like");
                                    }
                                })
                                .catch(err => {
                                    console.error('Erro:', err);
                                    alert("Erro de conexão");
                                })
                                .finally(() => {
                                    btn.disabled = false;
                                    btn.style.opacity = '1';
                                });
                        }
                        
                        function carregarLikesUsuario() {
                            fetch('/api/likes/recado/' + usuarioAtual)
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success && data.likes) {
                                        data.likes.forEach(postId => {
                                            const btn = document.querySelector(\`.like-btn[data-post="\${postId}"]\`);
                                            if (btn) {
                                                btn.classList.add('liked');
                                                localStorage.setItem(\`liked_recado_\${postId}_\${usuarioAtual}\`, 'true');
                                            }
                                        });
                                    }
                                })
                                .catch(err => console.error('Erro ao carregar likes:', err));
                        }
                        
                        function editarRecado(postId) {
                            document.getElementById('post-content-' + postId).classList.add('hidden');
                            document.getElementById('edit-form-' + postId).classList.remove('hidden');
                        }
                        
                        function cancelarEdicao(postId) {
                            document.getElementById('post-content-' + postId).classList.remove('hidden');
                            document.getElementById('edit-form-' + postId).classList.add('hidden');
                        }
                        
                        document.addEventListener('DOMContentLoaded', function() {
                            selecionarTipo('texto');
                            carregarLikesUsuario();
                        });
                    </script>
                    `;
                    
                    res.send(layout("Recados", conteudo, req.session.user, userCargo, userTurma));
                }
            );
        }
    );
});

// Rota para publicar recado
app.post("/publicar-recado", upload.single('arquivo'), (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    db.query("SELECT cargo FROM usuarios WHERE user=?", [req.session.user], (err, result) => {
        if (err || !result || result.length === 0) {
            return res.redirect("/recados?erro=permissao");
        }
        
        const cargo = result[0].cargo;
        if (!cargo || !(cargo.includes('Diretor') || cargo.includes('Vice Diretor') || cargo.includes('Coordenador') || cargo.includes('Professor'))) {
            return res.redirect("/recados?erro=permissao");
        }
        
        let { titulo, conteudo, tipo, youtube_url } = req.body;
        const arquivo = req.file ? req.file.filename : null;
        
        if (Array.isArray(titulo)) {
            titulo = titulo.find(t => t && t.trim() !== '') || '';
        }
        
        if (Array.isArray(conteudo)) {
            conteudo = conteudo.find(c => c && c.trim() !== '') || '';
        }
        
        if (!titulo || !titulo.trim()) {
            return res.redirect("/recados?erro=titulo_vazio");
        }
        
        if (tipo === 'texto' && (!conteudo || !conteudo.trim())) {
            return res.redirect("/recados?erro=texto_vazio");
        }
        
        if ((tipo === 'foto' || tipo === 'video' || tipo === 'pdf') && !arquivo) {
            return res.redirect("/recados?erro=arquivo_vazio");
        }
        
        if (tipo === 'youtube' && (!youtube_url || !youtube_url.trim())) {
            return res.redirect("/recados?erro=youtube_vazio");
        }
        
        if (tipo === 'pdf' && arquivo) {
            const extensao = path.extname(arquivo).toLowerCase();
            if (extensao !== '.pdf') {
                return res.redirect("/recados?erro=pdf_invalido");
            }
        }
        
        const query = "INSERT INTO recados_posts (user, titulo, conteudo, tipo, arquivo, youtube_url) VALUES (?, ?, ?, ?, ?, ?)";
        const valores = [
            req.session.user, 
            titulo,
            conteudo || null, 
            tipo, 
            arquivo || null,
            youtube_url || null
        ];
        
        db.query(query, valores, (err, result) => {
            if (err) {
                console.log("❌ ERRO DETALHADO NO BANCO DE DADOS:", err);
                return res.redirect("/recados?erro=banco");
            }
            
            console.log("✅ Recado criado com sucesso! ID:", result.insertId);
            res.redirect("/recados?sucesso=post_criado");
        });
    });
});

// Rota para editar recado
app.post("/editar-recado/:postId", upload.single('arquivo'), (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    const postId = req.params.postId;
    const { titulo, conteudo, youtube_url } = req.body;
    const arquivo = req.file ? req.file.filename : null;
    
    db.query("SELECT user FROM recados_posts WHERE id = ?", [postId], (err, postResult) => {
        if (err || !postResult || postResult.length === 0) {
            return res.redirect("/recados");
        }
        
        const donoPost = postResult[0].user;
        
        db.query("SELECT cargo FROM usuarios WHERE user=?", [req.session.user], (err, userResult) => {
            if (err || !userResult || userResult.length === 0) {
                return res.redirect("/recados");
            }
            
            const cargo = userResult[0].cargo;
            
            if (!cargo || !(cargo.includes('Diretor') || cargo.includes('Vice Diretor') || cargo.includes('Coordenador') || cargo.includes('Professor')) || donoPost !== req.session.user) {
                return res.redirect("/recados?erro=permissao");
            }
            
            let query = "UPDATE recados_posts SET titulo = ?, conteudo = ?, youtube_url = ?";
            let valores = [titulo, conteudo || null, youtube_url || null];
            
            if (arquivo) {
                query += ", arquivo = ?";
                valores.push(arquivo);
            }
            
            query += " WHERE id = ? AND user = ?";
            valores.push(postId, req.session.user);
            
            db.query(query, valores, (err, result) => {
                if (err) {
                    console.log(err);
                    return res.redirect("/recados?erro=banco");
                }
                res.redirect("/recados?sucesso=post_editado");
            });
        });
    });
});

// Rota para deletar recado
app.get("/deletar-recado/:postId", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    const postId = req.params.postId;
    
    db.query("SELECT user FROM recados_posts WHERE id = ?", [postId], (err, postResult) => {
        if (err || !postResult || postResult.length === 0) {
            return res.redirect("/recados");
        }
        
        const donoPost = postResult[0].user;
        
        db.query("SELECT cargo FROM usuarios WHERE user=?", [req.session.user], (err, userResult) => {
            if (err || !userResult || userResult.length === 0) {
                return res.redirect("/recados");
            }
            
            const cargo = userResult[0].cargo;
            
            if (!cargo || !(cargo.includes('Diretor') || cargo.includes('Vice Diretor') || cargo.includes('Coordenador') || cargo.includes('Professor')) || donoPost !== req.session.user) {
                return res.redirect("/recados?erro=permissao");
            }
            
            db.query("DELETE FROM recados_posts WHERE id = ? AND user = ?", [postId, req.session.user], (err, result) => {
                if (err) {
                    console.log(err);
                    return res.redirect("/recados?erro=banco");
                }
                res.redirect("/recados?sucesso=post_deletado");
            });
        });
    });
});

// Rota para likes em recados
app.post("/like/recado/:postId", (req, res) => {
    if (!req.session.user) {
        return res.json({ success: false, error: "Não logado" });
    }
    
    const postId = req.params.postId;
    const user = req.session.user;
    
    console.log(`🔄 Processando like no recado ${postId} pelo usuário ${user}`);
    
    db.query(
        "SELECT * FROM likes WHERE user = ? AND recado_id = ?",
        [user, postId],
        (err, result) => {
            if (err) {
                console.log("❌ Erro ao verificar like:", err);
                return res.json({ success: false, error: "Erro ao verificar like" });
            }
            
            const jaCurtiu = result && result.length > 0;
            
            if (jaCurtiu) {
                db.query(
                    "DELETE FROM likes WHERE user = ? AND recado_id = ?",
                    [user, postId],
                    (err, deleteResult) => {
                        if (err) {
                            console.log("❌ Erro ao remover like:", err);
                            return res.json({ success: false, error: "Erro ao remover like" });
                        }
                        
                        db.query(
                            "UPDATE recados_posts SET likes = likes - 1 WHERE id = ?",
                            [postId],
                            (err, updateResult) => {
                                if (err) {
                                    console.log("❌ Erro ao atualizar contador:", err);
                                    return res.json({ success: false, error: "Erro ao atualizar contador" });
                                }
                                
                                db.query(
                                    "SELECT likes FROM recados_posts WHERE id = ?",
                                    [postId],
                                    (err, selectResult) => {
                                        if (err) {
                                            console.log("❌ Erro ao buscar likes atualizados:", err);
                                            return res.json({ success: false });
                                        }
                                        
                                        const novosLikes = selectResult[0]?.likes || 0;
                                        
                                        res.json({ 
                                            success: true, 
                                            likes: novosLikes,
                                            liked: false 
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            } else {
                db.query(
                    "INSERT INTO likes (user, recado_id) VALUES (?, ?)",
                    [user, postId],
                    (err, insertResult) => {
                        if (err) {
                            console.log("❌ Erro ao adicionar like:", err);
                            
                            if (err.code === 'ER_DUP_ENTRY') {
                                return res.json({ success: false, error: "Like já existe" });
                            }
                            
                            return res.json({ success: false, error: "Erro ao adicionar like" });
                        }
                        
                        db.query(
                            "UPDATE recados_posts SET likes = likes + 1 WHERE id = ?",
                            [postId],
                            (err, updateResult) => {
                                if (err) {
                                    console.log("❌ Erro ao atualizar contador:", err);
                                    return res.json({ success: false, error: "Erro ao atualizar contador" });
                                }
                                
                                db.query(
                                    "SELECT likes FROM recados_posts WHERE id = ?",
                                    [postId],
                                    (err, selectResult) => {
                                        if (err) {
                                            console.log("❌ Erro ao buscar likes atualizados:", err);
                                            return res.json({ success: false });
                                        }
                                        
                                        const novosLikes = selectResult[0]?.likes || 0;
                                        
                                        res.json({ 
                                            success: true, 
                                            likes: novosLikes,
                                            liked: true 
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            }
        }
    );
});

// Rota para verificar likes do usuário em recados
app.get("/api/likes/recado/:usuario", (req, res) => {
    if (!req.session.user || req.session.user !== req.params.usuario) {
        return res.json({ success: false, error: "Não autorizado" });
    }
    
    const usuario = req.params.usuario;
    
    db.query(
        "SELECT recado_id FROM likes WHERE user = ? AND recado_id IS NOT NULL",
        [usuario],
        (err, result) => {
            if (err) {
                console.log("❌ Erro ao buscar likes do usuário:", err);
                return res.json({ success: false, error: "Erro ao buscar likes" });
            }
            
            const likes = result.map(row => row.recado_id);
            res.json({ success: true, likes: likes });
        }
    );
});

// Função geradora de post de recado
function gerarPostRecadoHtml(post, usuarioLogado, cargoUsuario) {
    const podeEditar = (post.user === usuarioLogado) && 
                       (cargoUsuario && (cargoUsuario.includes('Diretor') || 
                        cargoUsuario.includes('Vice Diretor') || 
                        cargoUsuario.includes('Coordenador') ||
                        cargoUsuario.includes('Professor')));
    
    let conteudoPost = '';
    const dataPost = new Date(post.created_at).toLocaleString('pt-BR');
    
    if (post.tipo === 'texto') {
        conteudoPost = `
            <div style="background: #f8f9fa; padding: 20px; border-radius: 10px;">
                <h3 style="color: #004080; margin-bottom: 15px;">${post.titulo}</h3>
                <p style="font-size: 1.1em; line-height: 1.6; white-space: pre-wrap;">${post.conteudo}</p>
            </div>
        `;
    } else if (post.tipo === 'foto') {
        conteudoPost = `
            <div style="text-align: center;">
                <h3 style="color: #004080; margin-bottom: 15px;">${post.titulo}</h3>
                <img src="/uploads/${post.arquivo}" class="post-media" style="max-height: 400px;">
                ${post.conteudo ? `<p style="margin-top: 10px; background: #f8f9fa; padding: 15px; border-radius: 10px;">${post.conteudo}</p>` : ''}
            </div>
        `;
    } else if (post.tipo === 'video') {
        conteudoPost = `
            <div style="text-align: center;">
                <h3 style="color: #004080; margin-bottom: 15px;">${post.titulo}</h3>
                <video controls class="post-media" style="max-height: 400px;">
                    <source src="/uploads/${post.arquivo}">
                </video>
                ${post.conteudo ? `<p style="margin-top: 10px; background: #f8f9fa; padding: 15px; border-radius: 10px;">${post.conteudo}</p>` : ''}
            </div>
        `;
    } else if (post.tipo === 'youtube') {
        let videoId = '';
        if (post.youtube_url.includes('youtu.be')) {
            videoId = post.youtube_url.split('youtu.be/')[1];
        } else if (post.youtube_url.includes('v=')) {
            videoId = post.youtube_url.split('v=')[1].split('&')[0];
        }
        
        conteudoPost = `
            <div style="text-align: center;">
                <h3 style="color: #004080; margin-bottom: 15px;">${post.titulo}</h3>
                <iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" 
                        frameborder="0" allowfullscreen class="post-media" style="max-width: 100%;"></iframe>
                ${post.conteudo ? `<p style="margin-top: 10px; background: #f8f9fa; padding: 15px; border-radius: 10px;">${post.conteudo}</p>` : ''}
            </div>
        `;
    } else if (post.tipo === 'pdf') {
        conteudoPost = `
            <div class="pdf-container">
                <div class="pdf-header">
                    <div>
                        <span class="pdf-title">📄 ${post.titulo}</span>
                        <div class="pdf-info">
                            Publicado por: ${post.user} (${post.autor_cargo})
                        </div>
                        ${post.conteudo ? `<p style="margin-top: 10px; color: #666;">${post.conteudo}</p>` : ''}
                    </div>
                    <a href="/uploads/${post.arquivo}" class="pdf-download" download>📥 Download</a>
                </div>
                <iframe src="/uploads/${post.arquivo}#toolbar=1&navpanes=1" class="pdf-viewer"></iframe>
            </div>
        `;
    }
    
    return `
    <div class="post" id="post-${post.id}">
        <div class="post-header">
            <span class="post-author">👤 ${post.user} (${post.autor_cargo})</span>
            <span class="post-date">📅 ${dataPost}</span>
        </div>
        
        <div class="post-content" id="post-content-${post.id}">
            ${conteudoPost}
        </div>
        
        ${podeEditar ? `
        <div class="edit-form hidden" id="edit-form-${post.id}">
            <form method="post" action="/editar-recado/${post.id}" enctype="multipart/form-data">
                <input type="text" name="titulo" value="${post.titulo || ''}" placeholder="Título" required>
                <textarea name="conteudo" rows="3" placeholder="Conteúdo...">${post.conteudo || ''}</textarea>
                <input type="text" name="youtube_url" value="${post.youtube_url || ''}" placeholder="URL do YouTube">
                <input type="file" name="arquivo" accept="image/*,video/*,.pdf">
                <div style="display: flex; gap: 10px;">
                    <button type="submit">Salvar</button>
                    <button type="button" onclick="cancelarEdicao(${post.id})" style="background: #666;">Cancelar</button>
                </div>
            </form>
        </div>
        ` : ''}
        
        <div class="post-actions">
            <button class="action-btn like-btn" data-post="${post.id}" onclick="likeRecado(${post.id})">
                👍 <span id="likes-${post.id}">${post.likes || 0}</span>
            </button>
            
            ${podeEditar ? `
            <button class="action-btn" onclick="editarRecado(${post.id})">✏️ Editar</button>
            <a href="/deletar-recado/${post.id}" class="action-btn" onclick="return confirm('Tem certeza que deseja deletar este recado?')">🗑️ Deletar</a>
            ` : ''}
        </div>
    </div>
    `;
}

// ===== NOVAS ROTAS PARA EVENTOS =====

// Função para obter feriados nacionais
function getFeriadosNacionais(ano) {
    const feriados = [
        { data: `${ano}-01-01`, nome: "Confraternização Universal" },
        { data: `${ano}-04-21`, nome: "Tiradentes" },
        { data: `${ano}-05-01`, nome: "Dia do Trabalho" },
        { data: `${ano}-09-07`, nome: "Independência do Brasil" },
        { data: `${ano}-10-12`, nome: "Nossa Senhora Aparecida" },
        { data: `${ano}-11-02`, nome: "Finados" },
        { data: `${ano}-11-15`, nome: "Proclamação da República" },
        { data: `${ano}-12-25`, nome: "Natal" }
    ];
    
    // Calcular Carnaval (47 dias antes da Páscoa)
    const pascoa = getPascoa(ano);
    const carnaval = new Date(pascoa);
    carnaval.setDate(carnaval.getDate() - 47);
    feriados.push({ 
        data: carnaval.toISOString().split('T')[0], 
        nome: "Carnaval" 
    });
    
    // Calcular Sexta-feira Santa (2 dias antes da Páscoa)
    const sextaSanta = new Date(pascoa);
    sextaSanta.setDate(sextaSanta.getDate() - 2);
    feriados.push({ 
        data: sextaSanta.toISOString().split('T')[0], 
        nome: "Sexta-feira Santa" 
    });
    
    // Calcular Corpus Christi (60 dias após a Páscoa)
    const corpusChristi = new Date(pascoa);
    corpusChristi.setDate(corpusChristi.getDate() + 60);
    feriados.push({ 
        data: corpusChristi.toISOString().split('T')[0], 
        nome: "Corpus Christi" 
    });
    
    return feriados;
}

// Função para calcular a data da Páscoa (Algoritmo de Gauss)
function getPascoa(ano) {
    const a = ano % 19;
    const b = Math.floor(ano / 100);
    const c = ano % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    
    return new Date(ano, mes - 1, dia);
}

// Rota principal de eventos
app.get("/eventos", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    db.query(
        "SELECT cargo, turma FROM usuarios WHERE user=?",
        [req.session.user],
        (err, userResult) => {
            if (err || !userResult || userResult.length === 0) {
                return res.redirect("/");
            }
            
            const userCargo = userResult[0].cargo;
            const userTurma = userResult[0].turma;
            
            // Pegar mês e ano da URL ou usar atual
            const hoje = new Date();
            const mesSelecionado = parseInt(req.query.mes) || hoje.getMonth() + 1;
            const anoSelecionado = parseInt(req.query.ano) || hoje.getFullYear();
            
            // Buscar eventos do banco para o mês selecionado
            db.query(
                `SELECT e.*, u.user as autor_nome 
                 FROM eventos e
                 JOIN usuarios u ON e.user = u.user
                 WHERE MONTH(e.data_evento) = ? AND YEAR(e.data_evento) = ?
                 ORDER BY e.data_evento ASC`,
                [mesSelecionado, anoSelecionado],
                (err, eventos) => {
                    if (err) {
                        console.log("Erro ao carregar eventos:", err);
                        eventos = [];
                    }
                    
                    db.query(
                        `SELECT c.*, u.user as autor_nome 
                         FROM comunicados c
                         JOIN usuarios u ON c.user = u.user
                         ORDER BY c.created_at DESC`,
                        (err, comunicados) => {
                            if (err) {
                                console.log("Erro ao carregar comunicados:", err);
                                comunicados = [];
                            }
                            
                            const podePublicar = userCargo && (
                                userCargo.includes('Diretor') || 
                                userCargo.includes('Vice Diretor') || 
                                userCargo.includes('Coordenador')
                            );
                            
                            // Verificar se é aluno (só pode ver)
                            const isAluno = userCargo && userCargo.includes('Aluno');
                            
                            let mensagem = '';
                            if (req.query.sucesso === 'evento_criado') {
                                mensagem = '<div class="alert alert-success">✅ Evento adicionado com sucesso!</div>';
                            } else if (req.query.sucesso === 'comunicado_criado') {
                                mensagem = '<div class="alert alert-success">✅ Comunicado publicado com sucesso!</div>';
                            } else if (req.query.sucesso === 'evento_deletado') {
                                mensagem = '<div class="alert alert-success">✅ Evento removido com sucesso!</div>';
                            } else if (req.query.erro === 'banco') {
                                mensagem = '<div class="alert alert-error">❌ Erro ao salvar no banco de dados!</div>';
                            }
                            
                            // Gerar feriados nacionais para o ano selecionado
                            const feriadosNacionais = getFeriadosNacionais(anoSelecionado);
                            
                            // Filtrar feriados do mês selecionado
                            const feriadosDoMes = feriadosNacionais.filter(f => {
                                const data = new Date(f.data);
                                return data.getMonth() + 1 === mesSelecionado;
                            });
                            
                            let formularioEvento = '';
                            let formularioComunicado = '';
                            
                            // Só mostrar formulários se NÃO for aluno
                            if (podePublicar && !isAluno) {
                                formularioEvento = `
                                <div class="post-form">
                                    <h3>📅 Adicionar Evento/Feriado</h3>
                                    <form method="post" action="/adicionar-evento">
                                        <div class="form-group">
                                            <label>Título:</label>
                                            <input type="text" name="titulo" placeholder="Título do evento" required>
                                        </div>
                                        <div class="form-group">
                                            <label>Descrição:</label>
                                            <textarea name="descricao" rows="3" placeholder="Descrição do evento..."></textarea>
                                        </div>
                                        <div class="form-group">
                                            <label>Data:</label>
                                            <input type="date" name="data_evento" required>
                                        </div>
                                        <div class="form-group">
                                            <label>Tipo:</label>
                                            <select name="tipo">
                                                <option value="evento">Evento</option>
                                                <option value="feriado">Feriado</option>
                                            </select>
                                        </div>
                                        <button type="submit" style="width: 100%;">Adicionar Evento</button>
                                    </form>
                                </div>
                                `;
                                
                                formularioComunicado = `
                                <div class="post-form">
                                    <h3>📢 Publicar Comunicado</h3>
                                    <form method="post" action="/publicar-comunicado">
                                        <div class="form-group">
                                            <label>Título:</label>
                                            <input type="text" name="titulo" placeholder="Título do comunicado" required>
                                        </div>
                                        <div class="form-group">
                                            <label>Conteúdo:</label>
                                            <textarea name="conteudo" rows="4" placeholder="Digite o comunicado..." required></textarea>
                                        </div>
                                        <div class="form-group">
                                            <label>
                                                <input type="checkbox" name="importante"> Marcar como importante
                                            </label>
                                        </div>
                                        <button type="submit" style="width: 100%;">Publicar Comunicado</button>
                                    </form>
                                </div>
                                `;
                            }
                            
                            // Gerar calendário
                            const primeiroDia = new Date(anoSelecionado, mesSelecionado - 1, 1);
                            const ultimoDia = new Date(anoSelecionado, mesSelecionado, 0);
                            const diasNoMes = ultimoDia.getDate();
                            const diaSemanaInicio = primeiroDia.getDay();
                            
                            const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
                            
                            let calendarioHtml = '<div class="calendario-grid">';
                            
                            // Cabeçalho com dias da semana
                            diasSemana.forEach(dia => {
                                calendarioHtml += `<div class="calendario-dia-semana">${dia}</div>`;
                            });
                            
                            // Dias vazios no início
                            for (let i = 0; i < diaSemanaInicio; i++) {
                                calendarioHtml += '<div class="calendario-dia outro-mes"></div>';
                            }
                            
                            // Dias do mês
                            for (let dia = 1; dia <= diasNoMes; dia++) {
                                const dataStr = `${anoSelecionado}-${mesSelecionado.toString().padStart(2, '0')}-${dia.toString().padStart(2, '0')}`;
                                
                                // Verificar se é feriado
                                const feriado = feriadosNacionais.find(f => f.data === dataStr);
                                const eventoDoDia = eventos.filter(e => {
                                    const dataEvento = new Date(e.data_evento).toISOString().split('T')[0];
                                    return dataEvento === dataStr;
                                });
                                
                                let classes = 'calendario-dia';
                                if (feriado) classes += ' feriado';
                                if (eventoDoDia.length > 0) classes += ' evento';
                                
                                let eventosHtml = '';
                                if (feriado) {
                                    eventosHtml += `<div class="dia-evento" title="${feriado.nome}">🎉 ${feriado.nome}</div>`;
                                }
                                eventoDoDia.forEach(evento => {
                                    eventosHtml += `<div class="dia-evento" title="${evento.titulo}">📅 ${evento.titulo}</div>`;
                                });
                                
                                calendarioHtml += `
                                    <div class="${classes}">
                                        <div class="dia-numero">${dia}</div>
                                        ${eventosHtml}
                                    </div>
                                `;
                            }
                            
                            calendarioHtml += '</div>';
                            
                            // Lista de eventos e feriados do mês
                            let eventosHtml = '<h3 style="margin: 20px 0 10px;">📅 Eventos e Feriados do Mês</h3>';
                            
                            // Combinar feriados do mês com eventos do banco
                            const todosEventosDoMes = [
                                ...feriadosDoMes.map(f => ({
                                    ...f,
                                    tipo: 'feriado',
                                    descricao: f.nome,
                                    data: f.data
                                })),
                                ...eventos
                            ];
                            
                            if (todosEventosDoMes.length > 0) {
                                todosEventosDoMes.sort((a, b) => {
                                    const dataA = new Date(a.data || a.data_evento);
                                    const dataB = new Date(b.data || b.data_evento);
                                    return dataA - dataB;
                                });
                                
                                todosEventosDoMes.forEach(evento => {
                                    const data = new Date(evento.data || evento.data_evento);
                                    const dataFormatada = data.toLocaleDateString('pt-BR');
                                    const tipo = evento.tipo || 'evento';
                                    const titulo = evento.titulo || evento.nome;
                                    const descricao = evento.descricao || '';
                                    
                                    let tipoClass = '';
                                    if (tipo === 'feriado') tipoClass = 'tipo-feriado';
                                    else if (tipo === 'evento') tipoClass = 'tipo-evento';
                                    
                                    eventosHtml += `
                                        <div class="evento-item">
                                            <div>
                                                <span class="evento-tipo ${tipoClass}">${tipo === 'feriado' ? '🎉' : '📅'} ${tipo}</span>
                                                <span class="evento-titulo">${titulo}</span>
                                            </div>
                                            <div class="evento-data">📅 ${dataFormatada}</div>
                                            ${descricao ? `<div class="evento-descricao">${descricao}</div>` : ''}
                                            ${podePublicar && evento.id ? `
                                                <div style="margin-top: 10px;">
                                                    <a href="/deletar-evento/${evento.id}" class="action-btn" onclick="return confirm('Remover este evento?')">🗑️ Remover</a>
                                                </div>
                                            ` : ''}
                                        </div>
                                    `;
                                });
                            } else {
                                eventosHtml += '<p style="text-align: center; color: #666; padding: 20px;">Nenhum feriado ou evento neste mês.</p>';
                            }
                            
                            // Lista de comunicados (todos podem ver)
                            let comunicadosHtml = '<h3 style="margin: 30px 0 10px;">📢 Comunicados</h3>';
                            if (comunicados.length > 0) {
                                comunicados.forEach(com => {
                                    const data = new Date(com.created_at).toLocaleString('pt-BR');
                                    comunicadosHtml += `
                                        <div class="comunicado-item ${com.importante ? 'importante' : ''}">
                                            <div class="comunicado-titulo">
                                                ${com.importante ? '🔴 ' : ''}${com.titulo}
                                            </div>
                                            <div class="comunicado-conteudo">
                                                ${com.conteudo}
                                            </div>
                                            <div class="comunicado-autor">
                                                Publicado por: ${com.autor_nome} - ${data}
                                            </div>
                                            ${podePublicar ? `
                                                <div style="margin-top: 10px;">
                                                    <a href="/deletar-comunicado/${com.id}" class="action-btn" onclick="return confirm('Deletar este comunicado?')">🗑️ Deletar</a>
                                                </div>
                                            ` : ''}
                                        </div>
                                    `;
                                });
                            } else {
                                comunicadosHtml += '<p style="text-align: center; color: #666; padding: 20px;">Nenhum comunicado publicado.</p>';
                            }
                            
                            const meses = [
                                'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                                'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
                            ];
                            
                            const conteudo = `
                            <div class="feed-container">
                                <h2>📅 Calendário Escolar - ${meses[mesSelecionado - 1]} ${anoSelecionado}</h2>
                                
                                ${mensagem}
                                
                                ${formularioEvento}
                                ${formularioComunicado}
                                
                                <div class="calendario-container">
                                    <div class="calendario-header">
                                        <div class="calendario-titulo">
                                            ${meses[mesSelecionado - 1]} ${anoSelecionado}
                                        </div>
                                        <div class="calendario-navegacao">
                                            <button onclick="mudarMes(-1)">← ${meses[(mesSelecionado - 2 + 12) % 12]}</button>
                                            <button onclick="mudarMes(1)">${meses[mesSelecionado % 12]} →</button>
                                        </div>
                                    </div>
                                    ${calendarioHtml}
                                </div>
                                
                                <div class="eventos-lista">
                                    ${eventosHtml}
                                </div>
                                
                                <div class="eventos-lista" style="margin-top: 30px;">
                                    ${comunicadosHtml}
                                </div>
                            </div>
                            
                            <script>
                                function mudarMes(direcao) {
                                    const url = new URL(window.location.href);
                                    const params = new URLSearchParams(url.search);
                                    let mes = parseInt(params.get('mes') || '${mesSelecionado}');
                                    let ano = parseInt(params.get('ano') || '${anoSelecionado}');
                                    
                                    mes += direcao;
                                    if (mes < 1) {
                                        mes = 12;
                                        ano -= 1;
                                    } else if (mes > 12) {
                                        mes = 1;
                                        ano += 1;
                                    }
                                    
                                    params.set('mes', mes);
                                    params.set('ano', ano);
                                    url.search = params.toString();
                                    window.location.href = url.toString();
                                }
                            </script>
                            `;
                            
                            res.send(layout("Eventos", conteudo, req.session.user, userCargo, userTurma));
                        }
                    );
                }
            );
        }
    );
});

// Rota para adicionar evento (só diretores e coordenadores)
app.post("/adicionar-evento", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    const { titulo, descricao, data_evento, tipo } = req.body;
    const usuario = req.session.user;
    
    db.query(
        "SELECT cargo FROM usuarios WHERE user=?",
        [usuario],
        (err, result) => {
            if (err || !result || result.length === 0) {
                return res.redirect("/eventos?erro=banco");
            }
            
            const cargo = result[0].cargo;
            if (!cargo || !(cargo.includes('Diretor') || cargo.includes('Vice Diretor') || cargo.includes('Coordenador'))) {
                return res.redirect("/eventos?erro=permissao");
            }
            
            db.query(
                "INSERT INTO eventos (user, titulo, descricao, data_evento, tipo) VALUES (?, ?, ?, ?, ?)",
                [usuario, titulo, descricao || null, data_evento, tipo],
                (err, result) => {
                    if (err) {
                        console.log("❌ Erro ao adicionar evento:", err);
                        return res.redirect("/eventos?erro=banco");
                    }
                    
                    res.redirect("/eventos?sucesso=evento_criado");
                }
            );
        }
    );
});

// Rota para deletar evento (só diretores e coordenadores)
app.get("/deletar-evento/:id", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    const id = req.params.id;
    const usuario = req.session.user;
    
    db.query(
        "SELECT user FROM eventos WHERE id=?",
        [id],
        (err, result) => {
            if (err || !result || result.length === 0) {
                return res.redirect("/eventos");
            }
            
            db.query(
                "SELECT cargo FROM usuarios WHERE user=?",
                [usuario],
                (err, userResult) => {
                    if (err || !userResult || userResult.length === 0) {
                        return res.redirect("/eventos");
                    }
                    
                    const cargo = userResult[0].cargo;
                    if (!cargo || !(cargo.includes('Diretor') || cargo.includes('Vice Diretor') || cargo.includes('Coordenador'))) {
                        return res.redirect("/eventos?erro=permissao");
                    }
                    
                    db.query(
                        "DELETE FROM eventos WHERE id=?",
                        [id],
                        (err, result) => {
                            if (err) {
                                console.log("❌ Erro ao deletar evento:", err);
                                return res.redirect("/eventos?erro=banco");
                            }
                            
                            res.redirect("/eventos?sucesso=evento_deletado");
                        }
                    );
                }
            );
        }
    );
});

// Rota para publicar comunicado (só diretores e coordenadores)
app.post("/publicar-comunicado", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    const { titulo, conteudo, importante } = req.body;
    const usuario = req.session.user;
    const isImportante = importante === 'on';
    
    db.query(
        "SELECT cargo FROM usuarios WHERE user=?",
        [usuario],
        (err, result) => {
            if (err || !result || result.length === 0) {
                return res.redirect("/eventos?erro=banco");
            }
            
            const cargo = result[0].cargo;
            if (!cargo || !(cargo.includes('Diretor') || cargo.includes('Vice Diretor') || cargo.includes('Coordenador'))) {
                return res.redirect("/eventos?erro=permissao");
            }
            
            db.query(
                "INSERT INTO comunicados (user, titulo, conteudo, importante) VALUES (?, ?, ?, ?)",
                [usuario, titulo, conteudo, isImportante],
                (err, result) => {
                    if (err) {
                        console.log("❌ Erro ao publicar comunicado:", err);
                        return res.redirect("/eventos?erro=banco");
                    }
                    
                    res.redirect("/eventos?sucesso=comunicado_criado");
                }
            );
        }
    );
});

// Rota para deletar comunicado (só diretores e coordenadores)
app.get("/deletar-comunicado/:id", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    const id = req.params.id;
    const usuario = req.session.user;
    
    db.query(
        "SELECT user FROM comunicados WHERE id=?",
        [id],
        (err, result) => {
            if (err || !result || result.length === 0) {
                return res.redirect("/eventos");
            }
            
            db.query(
                "SELECT cargo FROM usuarios WHERE user=?",
                [usuario],
                (err, userResult) => {
                    if (err || !userResult || userResult.length === 0) {
                        return res.redirect("/eventos");
                    }
                    
                    const cargo = userResult[0].cargo;
                    if (!cargo || !(cargo.includes('Diretor') || cargo.includes('Vice Diretor') || cargo.includes('Coordenador'))) {
                        return res.redirect("/eventos?erro=permissao");
                    }
                    
                    db.query(
                        "DELETE FROM comunicados WHERE id=?",
                        [id],
                        (err, result) => {
                            if (err) {
                                console.log("❌ Erro ao deletar comunicado:", err);
                                return res.redirect("/eventos?erro=banco");
                            }
                            
                            res.redirect("/eventos");
                        }
                    );
                }
            );
        }
    );
});

// ===== ROTAS PARA HORÁRIOS =====

app.get("/horarios", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    db.query(
        "SELECT cargo, turma FROM usuarios WHERE user=?",
        [req.session.user],
        (err, userResult) => {
            if (err || !userResult || userResult.length === 0) {
                return res.redirect("/");
            }
            
            const userCargo = userResult[0].cargo;
            const userTurma = userResult[0].turma;
            
            const conteudo = `
            <div class="feed-container">
                <h2>⏰ Horários</h2>
                <div class="post-form">
                    <h3>Em construção</h3>
                    <p style="text-align: center; color: #666; padding: 40px;">
                        A página de horários está em desenvolvimento.
                    </p>
                </div>
            </div>
            `;
            
            res.send(layout("Horários", conteudo, req.session.user, userCargo, userTurma));
        }
    );
});

// ===== ROTA PARA RÁDIO =====
app.get("/radio", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    
    db.query(
        "SELECT cargo, turma FROM usuarios WHERE user=?",
        [req.session.user],
        (err, userResult) => {
            if (err || !userResult || userResult.length === 0) {
                return res.redirect("/");
            }
            
            const userCargo = userResult[0].cargo;
            const userTurma = userResult[0].turma;
            
            const conteudo = `
            <div class="radio-page">
                <h2>📻 Rádio Online</h2>
                <p style="text-align: center; color: #666; margin-bottom: 30px;">Ouça nossa programação 24 horas por dia</p>
                
                <div class="radio-main-player">
                    <div class="radio-cover">
                        <img src="https://via.placeholder.com/300?text=TrendFM" alt="Rádio Cover">
                    </div>
                    
                    <div class="radio-info">
                        <h3>TrendFM</h3>
                        <p class="radio-genre">Música, Entretenimento e Informação</p>
                    </div>
                    
                    <div class="radio-now-playing" id="radioNowPlaying">
                        <h4>Tocando agora:</h4>
                        <div class="current-song" id="currentSong">Carregando...</div>
                        <div class="current-artist" id="currentArtist">Rádio Escola</div>
                    </div>
                    
                    <div class="radio-big-controls">
                        <button class="radio-big-btn" onclick="playRadioFull()" id="bigPlayBtn">▶️</button>
                        <button class="radio-big-btn" onclick="pauseRadioFull()" id="bigPauseBtn" style="display:none;">⏸️</button>
                        <button class="radio-big-btn" onclick="stopRadioFull()">⏹️</button>
                    </div>
                    
                    <div class="radio-volume-big">
                        <label>Volume</label>
                        <input type="range" id="bigVolume" min="0" max="100" value="70" onchange="changeRadioVolumeFull(this.value)">
                    </div>
                    
                    <div class="radio-status-big" id="bigRadioStatus">
                        <span class="status-dot offline"></span>
                        Clique em Play para começar
                    </div>
                </div>
                
                <div class="radio-info-box">
                    <h4>Sobre a Rádio</h4>
                    <p>🎵 Música 24 horas por dia</p>
                    <p>📢 Informações importantes da escola</p>
                    <p>🎤 Entrevistas e programas especiais</p>
                    <p>📅 Programação semanal diversificada</p>
                </div>
            </div>
            
            <style>
                .radio-page {
                    max-width: 800px;
                    margin: 0 auto;
                }
                
                .radio-main-player {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 20px;
                    padding: 40px;
                    color: white;
                    text-align: center;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                }
                
                .radio-cover img {
                    width: 200px;
                    height: 200px;
                    border-radius: 50%;
                    object-fit: cover;
                    margin-bottom: 20px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                    animation: rotate 20s linear infinite;
                    animation-play-state: paused;
                }
                
                .radio-cover img.playing {
                    animation-play-state: running;
                }
                
                @keyframes rotate {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                
                .radio-info h3 {
                    font-size: 28px;
                    margin-bottom: 10px;
                }
                
                .radio-genre {
                    opacity: 0.9;
                    margin-bottom: 20px;
                }
                
                .radio-now-playing {
                    background: rgba(255,255,255,0.1);
                    padding: 20px;
                    border-radius: 15px;
                    margin: 20px 0;
                }
                
                .radio-now-playing h4 {
                    margin-bottom: 10px;
                    font-size: 16px;
                    opacity: 0.9;
                }
                
                .radio-now-playing .current-song {
                    font-size: 24px;
                    font-weight: bold;
                    margin-bottom: 5px;
                }
                
                .radio-now-playing .current-artist {
                    font-size: 18px;
                    opacity: 0.9;
                }
                
                .radio-big-controls {
                    display: flex;
                    justify-content: center;
                    gap: 20px;
                    margin: 30px 0;
                }
                
                .radio-big-btn {
                    width: 80px;
                    height: 80px;
                    border-radius: 50%;
                    border: none;
                    font-size: 32px;
                    cursor: pointer;
                    background: white;
                    color: #667eea;
                    transition: all 0.3s;
                    box-shadow: 0 5px 20px rgba(0,0,0,0.2);
                }
                
                .radio-big-btn:hover {
                    transform: scale(1.1);
                }
                
                .radio-volume-big {
                    margin: 20px 0;
                }
                
                .radio-volume-big input {
                    width: 300px;
                    margin-left: 10px;
                }
                
                .radio-status-big {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    padding: 15px;
                    background: rgba(255,255,255,0.1);
                    border-radius: 30px;
                }
                
                .status-dot {
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    display: inline-block;
                }
                
                .status-dot.online {
                    background: #4CAF50;
                    animation: pulse 2s infinite;
                }
                
                .status-dot.offline {
                    background: #999;
                }
                
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; }
                    100% { opacity: 1; }
                }
                
                .radio-info-box {
                    background: white;
                    border-radius: 15px;
                    padding: 30px;
                    margin-top: 30px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                }
                
                .radio-info-box h4 {
                    color: #004080;
                    margin-bottom: 20px;
                    font-size: 20px;
                }
                
                .radio-info-box p {
                    margin: 10px 0;
                    color: #666;
                    font-size: 16px;
                }
            </style>
            
            <script>
                // Sincronizar com o player global
                const bigPlayBtn = document.getElementById('bigPlayBtn');
                const bigPauseBtn = document.getElementById('bigPauseBtn');
                const bigStatus = document.getElementById('bigRadioStatus');
                const coverImg = document.querySelector('.radio-cover img');
                const bigVolume = document.getElementById('bigVolume');
                const currentSong = document.getElementById('currentSong');
                const currentArtist = document.getElementById('currentArtist');
                
                // Função para atualizar música atual
                function atualizarMusicaAtual() {
                    fetch('/api/radio/now-playing')
                        .then(response => response.json())
                        .then(data => {
                            if (data.success) {
                                currentSong.textContent = data.musica || "Música Desconhecida";
                                currentArtist.textContent = data.artista || "Rádio Escola";
                            }
                        })
                        .catch(err => console.error('Erro ao buscar música:', err));
                }
                
                // Atualizar a cada 15 segundos
                setInterval(atualizarMusicaAtual, 15000);
                atualizarMusicaAtual();
                
                // Funções de controle que chamam as mesmas do mini player
                function playRadioFull() {
                    if (typeof playRadio === 'function') {
                        playRadio();
                    } else {
                        const radio = document.getElementById('radioAudio');
                        radio.play().catch(e => console.log(e));
                    }
                }
                
                function pauseRadioFull() {
                    if (typeof pauseRadio === 'function') {
                        pauseRadio();
                    } else {
                        const radio = document.getElementById('radioAudio');
                        radio.pause();
                    }
                }
                
                function stopRadioFull() {
                    if (typeof stopRadio === 'function') {
                        stopRadio();
                    } else {
                        const radio = document.getElementById('radioAudio');
                        radio.pause();
                        radio.currentTime = 0;
                    }
                }
                
                function changeRadioVolumeFull(value) {
                    if (typeof changeRadioVolume === 'function') {
                        changeRadioVolume(value);
                    } else {
                        const radio = document.getElementById('radioAudio');
                        radio.volume = value / 100;
                    }
                }
                
                // Sincronizar interface com o estado do rádio
                setInterval(() => {
                    const radio = document.getElementById('radioAudio');
                    if (radio) {
                        if (!radio.paused) {
                            bigPlayBtn.style.display = 'none';
                            bigPauseBtn.style.display = 'inline-block';
                            coverImg.classList.add('playing');
                            bigStatus.innerHTML = '<span class="status-dot online"></span> Tocando agora - Aproveite!';
                        } else {
                            bigPlayBtn.style.display = 'inline-block';
                            bigPauseBtn.style.display = 'none';
                            coverImg.classList.remove('playing');
                            if (radio.currentTime > 0) {
                                bigStatus.innerHTML = '<span class="status-dot offline"></span> Pausado';
                            } else {
                                bigStatus.innerHTML = '<span class="status-dot offline"></span> Clique em Play para começar';
                            }
                        }
                        
                        // Sincronizar volume
                        bigVolume.value = radio.volume * 100;
                    }
                }, 100);
                
                // Sincronizar volume quando mudar
                bigVolume.addEventListener('input', (e) => {
                    changeRadioVolumeFull(e.target.value);
                });
            </script>
            `;
            
            res.send(layout("Rádio Online", conteudo, req.session.user, userCargo, userTurma));
        }
    );
});

// ===== ROTA API PARA OBTER MÚSICA ATUAL DA RÁDIO =====
app.get("/api/radio/now-playing", (req, res) => {
    // Simulação de música atual - em um cenário real, você buscaria do stream
    // Como não temos acesso direto à API do stream, vamos retornar dados simulados
    const musicas = [
        { titulo: "Blinding Lights", artista: "The Weeknd" },
        { titulo: "Levitating", artista: "Dua Lipa" },
        { titulo: "Save Your Tears", artista: "The Weeknd" },
        { titulo: "Shape of You", artista: "Ed Sheeran" },
        { titulo: "Dance Monkey", artista: "Tones and I" },
        { titulo: "Watermelon Sugar", artista: "Harry Styles" },
        { titulo: "Bad Guy", artista: "Billie Eilish" },
        { titulo: "Old Town Road", artista: "Lil Nas X" }
    ];
    
    const musicaAtual = musicas[Math.floor(Math.random() * musicas.length)];
    
    res.json({
        success: true,
        musica: musicaAtual.titulo,
        artista: musicaAtual.artista
    });
});

// ===== SOCKET.IO =====

io.on("connection", (socket) => {
    console.log("Usuário conectado ao socket");
    
    socket.on('usuario-online', (data) => {
        socket.join(`turma-${data.turma}`);
        socket.broadcast.to(`turma-${data.turma}`).emit('usuario-online-status', {
            usuario: data.usuario,
            online: true
        });
    });
    
    socket.on('nova-mensagem', (data) => {
        console.log("Nova mensagem:", data);
        
        const query = "INSERT INTO mensagens (remetente, destinatario, turma, mensagem, tipo) VALUES (?, ?, ?, ?, ?)";
        const valores = [data.remetente, data.destinatario || null, data.turma || null, data.mensagem, data.tipo];
        
        db.query(query, valores, (err, result) => {
            if (err) {
                console.log("Erro ao salvar mensagem:", err);
                return;
            }
            
            data.id = result.insertId;
            data.created_at = new Date();
            data.editada = false;
            data.deletada = false;
            
            io.emit('mensagem-recebida', data);
        });
    });
    
    socket.on('digitando', (data) => {
        if (data.tipo === 'geral') {
            socket.to(`turma-${data.turma}`).emit('usuario-digitando', data);
        } else {
            socket.broadcast.emit('usuario-digitando', data);
        }
    });
    
    socket.on('mensagem-editada', (data) => {
        io.emit('mensagem-atualizada', data);
    });
    
    socket.on('mensagem-deletada', (data) => {
        io.emit('mensagem-deletada', data);
    });
    
    socket.on('disconnect', () => {
        console.log("Usuário desconectado");
    });
});

// ===== SERVER =====

server.listen(3000, () => {
    console.log("🚀 Servidor rodando na porta 3000");
    console.log("📱 Acesse: http://localhost:3000");
    console.log("📁 Pasta uploads criada em:", path.resolve('uploads'));
    console.log("📁 Pasta fotos_perfil criada em:", path.resolve('fotos_perfil'));
    console.log("📻 Rádio Online configurada com stream: " + RADIO_STREAM_URL);
});
