const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));


//sharedb
var WebSocket = require('ws');
const sharedb = require('sharedb/lib/client');
const richText = require('rich-text');
sharedb.types.register(richText.type);

//quill
const QuillDeltaToHtmlConverter = require('quill-delta-to-html').QuillDeltaToHtmlConverter;


const PORT = 4000;

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




