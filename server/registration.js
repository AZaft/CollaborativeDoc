
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const nodemailer = require("nodemailer");
const cookieParser = require('cookie-parser');




let transporter = nodemailer.createTransport({
    host: "localhost",
    port: 25,
    secure: false, 
    tls: {
          rejectUnauthorized: false
    }
});


app.use(cors());
app.use(bodyParser.json({limit: '10mb'}));
app.use(bodyParser.urlencoded({limit: '10mb', extended: false}));
app.use(cookieParser());

const PORT = 4001;


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
        //console.log(verifyLink);

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
            // console.log("ACTUAL:")
            // console.log(result);
            // console.log("GOT:")
            // console.log(req.body);
            // console.log("Login Failed");
        } else {
            let name = result.name;
            
            res.cookie('username',name, { maxAge: 900000, httpOnly: true });

            res.send({
              name
            })
            //console.log("Login Success");
        }
        //console.log(result);
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
    //console.log(req.query.user);
    users.findOne({email: req.query.user})
    .then(result => {
        //console.log(result._id.toString());
        //console.log(req.query.key);

        if(result == null  || req.query.key !== result._id.toString() || result.email == null){
            res.send({
                error: true,
                message: "Invalid Verification"
            })
            //console.log("Invalid key");
        } else {
            users.updateOne({email: req.query.user}, {$set: {disabled: false}}, {upsert: true})
                .then(result => {
                    //console.log("Verified");
                    return res.send({status: "ok"});
                });
        }
        //console.log(result);
    })
    .catch(err => {
        res.send({
            error: true,
            message: "Invalid Verification"
        })
        console.log(err);
    });
});