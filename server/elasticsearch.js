
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const path = require('path');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');


//elastic search
const { Client } = require('@elastic/elasticsearch')
const client = new Client({
  node: 'http://127.0.0.1:9200'
})


app.use(cors());
app.use(bodyParser.json({limit: '10mb'}));
app.use(bodyParser.urlencoded({limit: '10mb', extended: false}));
app.use(cookieParser());

const PORT = 4003;

//mongodb
const MongoClient = require('mongodb').MongoClient;
const url = 'mongodb://127.0.0.1:27017';
const ObjectID = require('mongodb').ObjectID;

let db;
MongoClient.connect(url, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}, (err, mclient) => {
    if (err) {
        return console.log(err);
    }
    db = mclient.db('CollaborativeDoc');
    console.log(`MongoDB Connected: ${url}`);
});

app.listen(PORT, () => {
  console.log(`Events service listening at http://localhost:${PORT}`)
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

            //console.log(term);
            return res.status(200).json([term]);
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
        query : {
            match_phrase: {
                content: {
                    query: req.query.q
                }
            }
        },
        highlight:{
            fragment_size: 150,
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

    //console.log(docs[0]);
    return res.status(200).json(docs);
})

async function addIndex(docID, ops){

    console.log('Indexing doc: ' + docID);

    let text = "";
    for(let i = 0; i < ops.length;i++){
        let op = ops[i];
        if(op.insert){
            text += op.insert + " ";
        }
    }

    let name = "Untitled";
    const names = db.collection('names');
    names.findOne({id: docID})
    .then(result => {
        name = result.name;
    })

    await client.index({
        index: 'docs',
        id: docID,
        document: {
            title: name,
            content: text
        }
    });
}


cron.schedule('*/10 * * * * * *', () => {
    db.collection('docs').find().toArray( async function(err, result) {
        for(let i = 0; i < result.length;i++){
            let doc = result[i];
            let ops = doc.ops;

            if(ops !== undefined && ops.length != 0){
                let modifiedtime = (Date.now() - doc._m.mtime) / 1000;
                if(modifiedtime < 10){
                    let id = doc._id;
                    addIndex(id, ops);
                }
            } 
        }
    });
});
