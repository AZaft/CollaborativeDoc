const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const path = require('path');
const multer  = require('multer')
const nodemailer = require("nodemailer");
const cookieParser = require('cookie-parser')

const valid_images = [
  'image/png',
  'image/jpeg',
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
  }
}).single('file');


app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());

const PORT = 4000;

//sharedb
var WebSocket = require('ws');
const sharedb = require('sharedb/lib/client');
const richText = require('rich-text');
sharedb.types.register(richText.type);
let doc;
let docNames = {}
let versionNumbers = [];

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
    if(request.cookies.username ===  undefined){
        
    }

    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader("X-Accel-Buffering", "no");
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
            version: versionNumbers[docID]
        };
        const data = `data: ${JSON.stringify(sendData)}\n\n`;
        response.write(data);
    }


    if(!docs.includes(docID)){
        doc.on('op', function(op, source) {
            //send changes to all clients except for client that made them
            for(let i = 0; i < clients.length;i++){
                if(clients[i].id !== currentClientID){
                    clients[i].response.write(`data: ${JSON.stringify(op)}\n\n`)
                } else {
                    clients[i].response.write(`data: ${JSON.stringify({ack: op})}\n\n`)
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
    //console.log("LOGGED IN: " + req.cookies.username);


    currentClientID = req.params.uid;
    currentDocID = req.params.docid;

    console.log(currentClientID);
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


    

    let versionNumber = versionNumbers[currentDocID];
    if(!versionNumber){
        versionNumbers[currentDocID] = 1;
    }

    console.log(versionNumber);
    if(versionNumber === req.body.version){
    
        //submit ops to sharedb
        doc.submitOp(req.body.op);
        versionNumbers[currentDocID]++;

        return res.send({status: "ok"});
    } else {
        return res.send({status: 'retry'});
    }
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
            clients[i].response.write(`data: ${JSON.stringify(sendData)}\n\n`);
        }
    }
    return res.send({status: "ok"});
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
    console.log("CREATING: " + docName);

    const docID = Date.now();

    const doc = connection.get('docs', docID.toString());
    doc.fetch(function (err) {
        if (err) throw err;
        if (doc.type === null) {
            doc.create([], 'rich-text');
            return;
        }
    });

    docNames[docID] = docName;
    versionNumbers[docID] = 1;
    
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
        console.log(req);
        if (err) {
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
    
    if(req.cookies.username ===  undefined){
        return res.send({
            error: true,
            message: "Not logged in!"
        });
    }

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