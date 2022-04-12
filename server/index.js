const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

const PORT = 4000;

//sharedb
var WebSocket = require('ws');
const sharedb = require('sharedb/lib/client');
const richText = require('rich-text');
sharedb.types.register(richText.type);

//quill
const QuillDeltaToHtmlConverter = require('quill-delta-to-html').QuillDeltaToHtmlConverter;


//mongodb
const MongoClient = require('mongodb').MongoClient;
const url = 'mongodb://127.0.0.1:27017';

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

//copy of doc
const doc = connection.get('docs', 'InitialDoc');
doc.fetch(function (err) {
  if (err) throw err;
});

let clients = [];
//connext to client
function eventsHandler(request, response, next) {
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders(); 


    const clientId = request.params.id;

    const newClient = {
    id: clientId,
    response
    };

    clients.push(newClient);
    console.log("New client: " + clientId);


    const sendData = {content: doc.data.ops};
    const data = `data: ${JSON.stringify(sendData)}\n\n`;
    response.write(data);

    request.on('close', () => {
      console.log(`${clientId} Connection closed`);
      clients = clients.filter(client => client.id !== clientId);
    });
}

app.get('/connect/:id', eventsHandler);

app.post('/op/:id', (req, res) => {
  currentClientID = req.params.id;
  console.log(currentClientID);
  console.log(req.body);

  //submit ops to sharedb
  for(let i = 0; i < req.body.length;i++){
    doc.submitOp(req.body[i]);
  }

  res.end();
});

app.get('/doc/:id', (req, res) => {
  let cfg = {};
  let converter = new QuillDeltaToHtmlConverter(doc.data.ops, cfg);

  let html = converter.convert();

  res.send(html);
});

doc.on('op', function(op, source) {
    let array_of_ops = [];
    array_of_ops.push(op);

    //send changes to all clients except for client that made them

    for(let i = 0; i < clients.length;i++){
      if(clients[i].id !== currentClientID){
        clients[i].response.write(`data: ${JSON.stringify(array_of_ops)}\n\n`)
      }
    }
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
            status: "ERROR"
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
                status: "ERROR"
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
            status: "ERROR"
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
                status: "ERROR"
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
            status: "ERROR"
        })
        console.log(err);
    });
});
