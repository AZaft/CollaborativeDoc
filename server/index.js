const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const path = require('path');

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

const PORT = 4000;

//sharedb
var WebSocket = require('ws');
const sharedb = require('sharedb/lib/client');
const richText = require('rich-text');
sharedb.types.register(richText.type);
let doc;

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

//cookie
const cookieSession = require('cookie-session');
app.use(cookieSession({
  name: 'session',
  keys: ["key1", "key2"],
  secure: false,


  // Cookie Options
  maxAge: 60 * 60 * 1000 // 1 hour
}))


app.listen(PORT, () => {
  console.log(`Events service listening at http://localhost:${PORT}`)
})

// Open WebSocket connection to ShareDB server
const socket = new WebSocket('ws://localhost:8080');
const connection = new sharedb.Connection(socket);

let currentClientID = 0;


let clients = [];
let docs = [];
//connext to client
function eventsHandler(request, response, next) {
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader("X-Accel-Buffering", "no");
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.flushHeaders(); 

    console.log(docs);
    const clientId = request.params.uid;
    const docID = request.params.docid;


    const newClient = {
        id: clientId,
        response
    };

    clients.push(newClient);
    console.log("New client: " + clientId);
    console.log("Doc to open: " + docID);

    const doc = connection.get('docs', docID);
    doc.fetch(function (err) {
        if (err) throw err;
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
            version: doc.version
        };
        const data = `data: ${JSON.stringify(sendData)}\n\n`;
        response.write(data);
    }


    if(!docs.includes(docID)){
        doc.on('op', function(op, source) {
            //send changes to all clients except for client that made them
            for(let i = 0; i < clients.length;i++){
                if(clients[i].id !== currentClientID){
                    console.log("sent");
                    clients[i].response.write(`data: ${JSON.stringify(op)}\n\n`)
                }
            }
        });
        docs.push(docID);
    }

    request.on('close', () => {
      console.log(`${clientId} Connection closed`);
      clients = clients.filter(client => client.id !== clientId);
    });
}

app.get('/doc/connect/:docid/:uid', eventsHandler);

app.post('/doc/op/:docid/:uid', (req, res) => {
    console.log("LOGGED IN: " + req.session.username);


    currentClientID = req.params.uid;
    currentDocID = req.params.docid;

    console.log(currentClientID);
    console.log(req.body);

    doc = connection.get('docs', currentDocID);
    doc.fetch(function (err) {
        if (err) throw err;
        if(doc.type === null){
            return res.send({
                error: true,
                message: "Doc does not exist for op submission"
            });
        }
    });

    //submit ops to sharedb
    doc.submitOp(req.body.op);
    res.end();
});

app.post('/doc/presence/:docid/:uid', (req, res) => {
    currentClientID = req.params.uid;
    currentDocID = req.params.docid;
    

    console.log(currentClientID);
    console.log(req.body);
    let range = req.body;

    for(let i = 0; i < clients.length;i++){
        if(clients[i].id !== currentClientID){
            let index = range.index;
            let length = range.length;
            let name = req.session.username;
            let id = currentDocID;
            if(name){
                sendData = {
                    id,
                    cursor: {
                        index,
                        length,
                        name
                    }
                };
            } else {
                sendData = {
                    currentClientID,
                    cursor: null
                };
            }
            clients[i].response.write(`data: ${JSON.stringify({presense: sendData})}\n\n`);
        }
    }

    res.end();
});

app.get('/doc/get/:docid/:uid', (req, res) => {

    const doc = connection.get('docs', req.params.docid);
    doc.fetch(function (err) {
        if (err) throw err;
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


app.post('/users/signup', (req, res) => {
    const users = db.collection('users');

    let user = {
        name: req.body.username,
        password: req.body.password,
        email: req.body.email,
        disabled: true
    }

    users.insertOne(user)
    .then(result => {
        console.log(result);
        //use id as verification key here
    })
    .catch(err => {
        console.log(err);
        res.send({
            error: true,
            message: "Signup Failed"
        })
    });

    res.sendStatus(200);
});

app.post('/users/login', (req, res) => {
    const users = db.collection('users');
    users.findOne({email: req.body.email})
    .then(result => {
        if(result == null || result.disabled || result.password !== req.body.password){
            res.send({
                error: true,
                message: "Invalid Login"
            })
            console.log("Login Failed");
        } else {
            let name = result.name;
            req.session.username = name;

            res.send({
              name
            })
            console.log("Login Success");
        }
        console.log(result);
    })
    .catch(err => {
        res.send({
            error: true,
            message: "Login failed"
        })
        console.log(err);
    });
});

app.post('/users/logout', (req, res) => {
    req.session = null;
    console.log("Logged out");
    res.sendStatus(200);
});


app.get('/users/verify', (req, res) => {
    const users = db.collection('users');
    users.findOne({name: req.query.user})
    .then(result => {
        console.log(result._id.toString());
        console.log(req.query.key);

        if(result == null  || req.query.key !== result._id.toString() || result.email == null){
            res.send({
                error: true,
                message: "Invalid Verification"
            })
            console.log("Invalid key");
        } else {
            users.updateOne({name: req.query.user}, {$set: {disabled: false}}, {upsert: true})
                .then(result => {
                    console.log("Verified");
                    res.sendStatus(200);
                });
        }
        console.log(result);
    })
    .catch(err => {
        res.send({
            error: true,
            message: "Invalid Verification"
        })
        console.log(err);
    });
});

app.post('/collection/create', (req, res) => {
    let docName = req.body.name;
    console.log(docName);

    const docID = Date.now();

    const doc = connection.get('docs', docID.toString());
    doc.fetch(function (err) {
        if (err) throw err;
        if (doc.type === null) {
            doc.create([], 'rich-text');
            return;
        }
    });

    res.send({
        docID
    })
});

app.post('/collection/delete', (req, res) => {
    let docID = req.body.docid;
    console.log(docID);

    const doc = connection.get('docs', docID);
    doc.fetch(function (err) {
        if (err) throw err;
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

    res.sendStatus(200);
});
