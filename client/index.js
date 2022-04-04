
var quill = new Quill('#editor', {
    theme: 'snow'
});

const id = Date.now();
const evtSource = new EventSource("http://localhost:4000/connect/" + id);

evtSource.onmessage = function(event) {
  let data = JSON.parse(event.data);

  if(data.content) {
    quill.setContents(data.content);
  } else {
    for(let i = 0; i < data.length;i++){
      quill.updateContents(data[i]);
    }
  }

  console.log(data);
}


quill.on('text-change', function (delta, oldDelta, source) {
        if (source !== 'user') return;

        //array of ops for future buffering
        let array_of_ops = [];
        
        array_of_ops.push( delta.ops );
  
        console.log(array_of_ops);

        var xhr = new XMLHttpRequest();
        xhr.open("POST", ("http://127.0.0.1:4000/op/" + id), true);
        xhr.setRequestHeader('Content-Type', 'application/json');


        xhr.send(JSON.stringify(array_of_ops));
});