
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const path = require('path');
const multer  = require('multer')
const cookieParser = require('cookie-parser');

const valid_images = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif'
]


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

const PORT = 4002;


app.listen(PORT, () => {
  console.log(`Events service listening at http://localhost:${PORT}`)
})


app.post('/media/upload',  function (req, res, next) {
    // if(req.cookies.username ===  undefined){
    //     return res.send({
    //         error: true,
    //         message: "Not logged in!"
    //     });
    // }

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
    // if(req.cookies.username ===  undefined){
    //     return res.send({
    //         error: true,
    //         message: "Not logged in!"
    //     });
    // }
    
    res.sendFile("/var/www/CollaborativeDoc/server/media/" + req.params.mediaid);
})


