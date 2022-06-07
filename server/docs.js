const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();

//sharedb
const ShareDB = require('sharedb');
const richText = require('rich-text');
ShareDB.types.register(require('rich-text').type);
const share_db = require('sharedb-mongo')(process.env.MONGO_URL + '/CollaborativeDoc', {mongoOptions: {}});
let shareDbServer = new ShareDB({db: share_db});
const connection = shareDbServer.connect();

app.use(cors());
app.use(bodyParser.json({limit: '10mb'}));
app.use(bodyParser.urlencoded({limit: '10mb', extended: false}));
app.use(cookieParser());

const PORT = process.env.PORT;

let doc_versions = {};

//quill
const QuillDeltaToHtmlConverter = require('quill-delta-to-html').QuillDeltaToHtmlConverter;

//mongodb
const MongoClient = require('mongodb').MongoClient;
const url = process.env.MONGO_URL;
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

    if(request.cookies.username ===  undefined){
        response.write(`data: ${JSON.stringify({loggedOut: true})}\n\n`);
        return response.end();
    }

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
    //console.log("New client: " + clientId);
    //console.log("Doc to open: " + docID);

    const doc = connection.get('docs', docID);
    doc.fetch(function (err) {
        if (err) throw console.log("sharedb error");
        let sendData;
        if (doc.type === null) {
            sendData = {
                error: true,
                message: "Connection failed: doc does not exist"
            };
            const data = `data: ${JSON.stringify(sendData)}\n\n`;
            response.write(data);
        } else {

            if(!doc_versions[docID]){
                doc_versions[docID] = 1;
            }

            sendData = {
                content: doc.data.ops, 
                version: doc_versions[docID]
            };

            const data = `data: ${JSON.stringify(sendData)}\n\n`;
            response.write(data);
        }
    });

    //console.log(clients);

    request.on('close', () => {
      console.log(`${clientId} Connection closed`);
      clients[docID] = clients[docID].filter(client => client.id !== clientId);
    });
}

app.get('/doc/connect/:docid/:uid', eventsHandler);

app.post('/doc/op/:docid/:uid', (req, res) => {
    //console.log("LOGGED IN: " + req.cookies.username);
    currentClientID = req.params.uid;
    currentDocID = req.params.docid;
    client_version = req.body.version;

    if(req.cookies.username ===  undefined){
        for(let i = 0; i < clients[currentDocID].length;i++){
            let client = clients[currentDocID][i];
            if(client.id !== currentClientID){
                client.response.write(`data: ${JSON.stringify({loggedOut: true})}\n\n`);
            }
        }
        
        return res.send({
            error: true,
            message: "Not logged in!"
        });
    }

    if(!doc_versions[currentDocID]){
        doc_versions[currentDocID] = 1;
    }

    server_version = doc_versions[currentDocID];
    op = req.body.op;

    //console.log(currentClientID);
    //console.log(req.body);

    const doc = connection.get('docs', currentDocID);
    doc.fetch(function (err) {
        if (err) console.log("sharedb error");

        if(doc.type === null){
            return res.send({
                error: true,
                message: "Doc does not exist for op submission"
            });
        }

        //console.log("client: " + client_version);
        //console.log("server: " + server_version);
        if(server_version === client_version){
            //submit ops to sharedb
            doc.submitOp(op, sendOps(currentDocID, op));
            
            
            return res.send({status: "ok"});
        } else {
            return res.send({status: 'retry', version: server_version});
        }
    });
});

function sendOps(docID, op){
    doc_versions[docID]++;

    for(let i = 0; i < clients[docID].length;i++){
        let client = clients[docID][i];
        if(client.id !== currentClientID){
            client.response.write(`data: ${JSON.stringify(op)}\n\n`)
        } else {
            client.response.write(`data: ${JSON.stringify({ack: op})}\n\n`)
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
    
    // console.log(currentClientID);
    // console.log(req.body);
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
            //console.log(sendData);
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
        if (err) console.log("sharedb error");
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
});



app.post('/collection/create', (req, res) => {
    if(req.cookies.username ===  undefined){
        return res.send({
            error: true,
            message: "Not logged in!"
        });
    }

    let docName = req.body.name;
    

    const docID = ObjectID().toString();
    
    const doc = connection.get('docs', docID);
    doc.fetch(function (err) {
        if (err) console.log("sharedb error");
        if (doc.type === null) {
            doc.create([], 'rich-text');
            return;
        }
    });

    const names = db.collection('names');
    names.insertOne({
        name: docName,
        id: docID,
        user: req.cookies.username
    });
    

    res.send({
        docid: `${docID}`
    })
});

app.post('/collection/delete', (req, res) => {
    if(req.cookies.username ===  undefined){
        return res.send({
            error: true,
            message: "Not logged in!"
        });
    }

    let docID = req.body.docid;
    //console.log(docID);

    const doc = connection.get('docs', docID);
    doc.fetch(function (err) {
        if (err) console.log("sharedb error");
        doc.destroy();
    });

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

app.get("/collection/list", (req, res) => { 
    if(req.cookies.username ===  undefined){
        return res.send({
            error: true,
            message: "Not logged in!"
        });
    }

    const docs = db.collection('docs');

    docs.find().sort({ "_m.mtime": -1}).limit(10).toArray( async function(err, result) {
        if (err) throw err;
    
        // console.log("10 RECENT: ");
        // console.log(result);


        let docpairs = []
        for(let i = 0; i < result.length;i++){
            let id = result[i]._id;
            let modified = result[i]._m.mtime;
            

            const names = db.collection('names');
            const r = await names.findOne({id: id});
            let name = r.name;
            let user = r.user;
            docpairs.push({id, name, modified, user});
    
        }

        return res.send(docpairs);
    });
})