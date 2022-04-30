
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const path = require('path');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');

app.use(cors());
app.use(bodyParser.json({limit: '10mb'}));
app.use(bodyParser.urlencoded({limit: '10mb', extended: false}));
app.use(cookieParser());

const PORT = 4000;

//sharedb
var WebSocket = require('ws');
const sharedb = require('sharedb/lib/client');
const richText = require('rich-text');
sharedb.types.register(richText.type);
let doc;
let docNames = {};
let doc_versions = {};

//quill
const QuillDeltaToHtmlConverter = require('quill-delta-to-html').QuillDeltaToHtmlConverter;

//mongodb
const MongoClient = require('mongodb').MongoClient;
const url = 'mongodb://127.0.0.1:27017';
const ObjectID = require('mongodb').ObjectID;

let db;
MongoClient.connect(url, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}, (err, client) => {
    if (err) {
        return console.log(err);
    }
    db = client.db('CollaborativeDoc');
    console.log(`MongoDB Connected: ${url}`);
});


app.listen(PORT, () => {
  console.log(`Events service listening at http://localhost:${PORT}`)
})

// Open WebSocket connection to ShareDB server
const socket = new WebSocket('ws://localhost:8080');
const connection = new sharedb.Connection(socket);

let currentClientID = 0;


let clients = {};

//connext to client
function eventsHandler(request, response, next) {

    const headers = {
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Cache-Control': 'no-cache'
    };
    response.writeHead(200, headers);

    const clientId = request.params.uid;
    const docID = request.params.docid;


    const newClient = {
        id: clientId,
        response
    };

    if(!clients[docID]){
        clients[docID] = [];
    }

    clients[docID].push(newClient);
    console.log("New client: " + clientId);
    console.log("Doc to open: " + docID);

    const doc = connection.get('docs', docID);
    doc.fetch(function (err) {
        if (err) throw console.log("sharedb error");
    });

    let sendData;
    if (doc.type === null) {
        sendData = {
            error: true,
            message: "Connection failed: doc does not exist"
        };
        const data = `data: ${JSON.stringify(sendData)}\n\n`;
        response.write(data);
    } else {

        sendData = {
            content: doc.data.ops, 
            version: doc_versions[docID]
        };

        const data = `data: ${JSON.stringify(sendData)}\n\n`;
        response.write(data);
    }


    //console.log(clients);

    request.on('close', () => {
      console.log(`${clientId} Connection closed`);
      clients[docID] = clients[docID].filter(client => client.id !== clientId);
    });
}

app.get('/doc/connect/:docid/:uid', eventsHandler);

app.post('/doc/op/:docid/:uid', (req, res) => {
    if(req.cookies.username ===  undefined){
        return res.send({
            error: true,
            message: "Not logged in!"
        });
    }

    //console.log("LOGGED IN: " + req.cookies.username);

    currentClientID = req.params.uid;
    currentDocID = req.params.docid;
    client_version = req.body.version;
    server_version = doc_versions[currentDocID];
    op = req.body.op;

    //console.log(currentClientID);
    //console.log(req.body);

    doc = connection.get('docs', currentDocID);
    doc.fetch(function (err) {
        if (err) throw console.log("sharedb error");

        if(doc.type === null){
            return res.send({
                error: true,
                message: "Doc does not exist for op submission"
            });
        }
    });

    //console.log("client: " + client_version);
    //console.log("server: " + server_version);

    if(server_version === client_version){
        //submit ops to sharedb
        doc.submitOp(op, sendOps(currentDocID, op));
        
        
        return res.send({status: "ok"});

    } else {
        return res.send({status: 'retry'});
    }
});

function sendOps(docID, op, version){
    doc_versions[docID]++;

    for(let i = 0; i < clients[docID].length;i++){
        if(clients[docID][i].id !== currentClientID){
            clients[docID][i].response.write(`data: ${JSON.stringify(op)}\n\n`)
        } else {
            clients[docID][i].response.write(`data: ${JSON.stringify({ack: op})}\n\n`)
        }
    }
}

app.post('/doc/presence/:docid/:uid', (req, res) => {
    if(req.cookies.username ===  undefined){
        return res.send({
            error: true,
            message: "Not logged in!"
        });
    }

    currentClientID = req.params.uid;
    currentDocID = req.params.docid;
    
    console.log(currentClientID);
    console.log(req.body);
    let range = req.body;

    for(let i = 0; i < clients[currentDocID].length;i++){
        if(clients[currentDocID][i].id !== currentClientID){
            let index = range.index;
            let length = range.length;
            let name = req.cookies.username;
            let id = currentClientID;
            if(name){
                sendData = {presence: {
                    id,
                    cursor: {
                        index,
                        length,
                        name
                    }
                }};
            } else {
                sendData = {presence : {
                    id,
                    cursor: null
                }};
            }
            //let data = {presence: sendData}
            console.log(sendData);
            clients[currentDocID][i].response.write(`data: ${JSON.stringify(sendData)}\n\n`);
        }
    }
    return res.send({status: "ok"});
});

app.get('/doc/get/:docid/:uid', (req, res) => {
    if(req.cookies.username ===  undefined){
        return res.send({
            error: true,
            message: "Not logged in!"
        });
    }

    const doc = connection.get('docs', req.params.docid);
    doc.fetch(function (err) {
        if (err) throw console.log("sharedb error");
    });

    if(doc.type === null){
        return res.send({
                error: true,
                message: "Doc does not for GET"
        });
    }

    let cfg = {};
    let converter = new QuillDeltaToHtmlConverter(doc.data.ops, cfg);

    let html = converter.convert();

    res.send(html);
});



app.post('/collection/create', (req, res) => {
    if(req.cookies.username ===  undefined){
        return res.send({
            error: true,
            message: "Not logged in!"
        });
    }

    let docName = req.body.name;
    

    const docID = Date.now();
    console.log("CREATING: " + docName + docID);

    const doc = connection.get('docs', docID.toString());
    doc.fetch(function (err) {
        if (err) throw console.log("sharedb error");
        if (doc.type === null) {
            doc.create([], 'rich-text');
            return;
        }
    });

    docNames[docID] = docName;
    doc_versions[docID] = 1;

    res.send({
        docid: `${docID}`
    })
});

// function createNamePair(docID, docName){
//     const names = db.collection('docNames');
//     let pair = {
//         name: docName,
//         id: docID
//     }
//     names.insertOne(pair)
//     .then(result => {
//         console.log(result);
//     })
//     .catch(err => {
//         console.log(err);
//         res.send({
//             error: true,
//             message: "Creation Failed"
//         })
//     });
// }

app.post('/collection/delete', (req, res) => {
    if(req.cookies.username ===  undefined){
        return res.send({
            error: true,
            message: "Not logged in!"
        });
    }

    let docID = req.body.docid;
    console.log(docID);

    const doc = connection.get('docs', docID);
    doc.fetch(function (err) {
        if (err) throw console.log("sharedb error");
    });

    doc.destroy();

    const docs = db.collection('docs');
    docs.deleteMany({ _id : docID })
    .then(result => {
        console.log(result);
    })
    .catch(err => {
        console.log(err);
        res.send({
            error: true,
            message: "Delete Failed"
        })
    });

    const o_docs = db.collection('o_docs');
    o_docs.deleteMany({ d : docID })
    .then(result => {
        console.log(result);
    })
    .catch(err => {
        console.log(err);
        return res.send({
            error: true,
            message: "Delete Failed"
        });
    });

    return res.send({status: "ok"});
});