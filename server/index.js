const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const path = require('path');
const multer  = require('multer')
const nodemailer = require("nodemailer");
const cookieParser = require('cookie-parser')

//elastic search
const { Client } = require('@elastic/elasticsearch')
const client = new Client({
  node: 'http://localhost:9200'
})

const valid_images = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif'
]

let transporter = nodemailer.createTransport({
    host: "localhost",
    port: 25,
    secure: false, 
    tls: {
          rejectUnauthorized: false
    }
});

var upload = multer({
  storage: multer.diskStorage({
    destination: './media',
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)) //Appending extension
    }
  }),
  fileFilter: (req, file, cb) => {
    if (!valid_images.includes(file.mimetype)) {
      return cb(new Error('file is not allowed'))
    }

    cb(null, true)
  },
}).single('file');


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
let docs_to_index = {};

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
        if (err) throw err;

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
    
        //index doc every 50 ops
        
        docs_to_index[currentDocID] = doc.data.ops;
        
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
        name: req.body.name,
        password: req.body.password,
        email: req.body.email,
        disabled: true
    }

    users.insertOne(user)
    .then(result => {
        let verifyLink = "http://attemptfarmer.cse356.compas.cs.stonybrook.edu/users/verify?user=" + encodeURIComponent(user.email) + "&key=" + result.insertedId.toString();
        console.log(verifyLink);

        transporter.sendMail({
            to: user.email,
            from: '"CollaborativeDoc" <root@ubuntu-1cpu-1gb-us-nyc1>', // Make sure you don't forget the < > brackets
            subject: "Verify Account",
            text: verifyLink
        })
    })
    .catch(err => {
        console.log(err);
        res.send({
            error: true,
            message: "Signup Failed"
        })
    });

    return res.send({status: "ok"});
});

app.post('/users/login', (req, res) => {
    const users = db.collection('users');
    users.findOne({email: req.body.email})
    .then(result => {
        if(result === null || result.disabled || result.password !== req.body.password){
            res.send({
                error: true,
                message: "Invalid Login"
            })
            console.log("ACTUAL:")
            console.log(result);
            console.log("GOT:")
            console.log(req.body);
            console.log("Login Failed");
        } else {
            let name = result.name;
            
            res.cookie('username',name, { maxAge: 900000, httpOnly: true });

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
    res.clearCookie("username");
    console.log("Logged out");
    return res.send({status: "ok"});
});


app.get('/users/verify', (req, res) => {
    const users = db.collection('users');
    console.log(req.query.user);
    users.findOne({email: req.query.user})
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
            users.updateOne({email: req.query.user}, {$set: {disabled: false}}, {upsert: true})
                .then(result => {
                    console.log("Verified");
                    return res.send({status: "ok"});
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
        if (err) throw err;
        if (doc.type === null) {
            doc.create([], 'rich-text');
            return;
        }
    });

    docNames[docID] = docName;
    doc_versions[docID] = 1;

    res.send({
        docid: docID
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

    return res.send({status: "ok"});
});


app.post('/media/upload',  function (req, res, next) {
    if(req.cookies.username ===  undefined){
        return res.send({
            error: true,
            message: "Not logged in!"
        });
    }

    upload(req, res, function (err) {
        if (err) {
            console.log(err);
            return res.send({
                    error: true,
                    message: "Only png and jpeg allowed!"
            });
        }  else {
            return res.send({
                mediaid: req.file.filename
            });
        }
    })
})

app.get('/media/access/:mediaid',  function (req, res, next) {
    if(req.cookies.username ===  undefined){
        return res.send({
            error: true,
            message: "Not logged in!"
        });
    }
    res.sendFile("/var/www/attemptfarmer.cse356.compas.cs.stonybrook.edu/CollaborativeDoc/server/media/" + req.params.mediaid);
})

app.get("/collection/list", (req, res) => { 
    
    // if(req.cookies.username ===  undefined){
    //     return res.send({
    //         error: true,
    //         message: "Not logged in!"
    //     });
    // }

    const docs = db.collection('docs');

    docs.find().sort({ "_m.mtime": -1}).limit(10).toArray(function(err, result) {
        if (err) throw err;
    
        console.log("10 RECENT: ");
        console.log(result);

        let docpairs = []
        for(let i = 0; i < result.length;i++){
            let id = result[i]._id;
            let name = docNames[result[i]._id];
            docpairs.push({id, name});
        }
        res.send(docpairs);
    });
})

app.get("/index/suggest", async (req, res) => { 
    
    // if(req.cookies.username ===  undefined){
    //     return res.send({
    //         error: true,
    //         message: "Not logged in!"
    //     });
    // }

    const result = await client.search({
        index: 'docs',
        size: 1,
        query : {
            prefix: {
                content: req.query.q
            }
        }
    })

    if(result.hits.total.value > 0){
        let content = result.hits.hits[0]._source.content;

        if(content){
            let temp = content.substring(content.indexOf(req.query.q));
            let term = temp.substring(0, temp.indexOf(" "));
            return res.send([term]);
        }
        return res.send([]);
    }
    return res.send([]);
})

app.get("/index/search",  async (req, res) => { 
    
    // if(req.cookies.username ===  undefined){
    //     return res.send({
    //         error: true,
    //         message: "Not logged in!"
    //     });
    // }

    console.log(req.query.q)

    const result = await client.search({
        index: 'docs',
        size: 10,
        query: {
            query_string: {
                query: req.query.q
            }
        },
        highlight:{
            fragment_size: 50,
            fields: {
                content: {}
            }
        }
    })

    let numHits = result.hits.total.value;

    let docs = [];

    for(let i = 0; i < numHits;i++){
        let hit = result.hits.hits[i];
        if(hit){
            docs.push({
                docid: hit._id,
                name: hit._source.title,
                snippet: hit.highlight.content[0]
            });
        }   
    }

    return res.send(docs);
})

async function addIndex(docID, ops){
    let text = "";
    for(let i = 0; i < ops.length;i++){
        let op = ops[i];
        if(op.insert){
            text += op.insert + " ";
        }
    }
    await client.update({
        index: 'docs',
        id: docID,
        doc_as_upsert: true,
        doc: {
            title: docNames[docID],
            content: text
        }
    });
}

function addIndexInterval(){
    let key = Object.keys(docs_to_index)[0];

    if(key) addIndex(key, docs_to_index[key]);

    delete docs_to_index[key];
}

var cancel = setInterval(addIndexInterval, 4000);