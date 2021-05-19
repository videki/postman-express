const express = require('express')
const cors = require('cors')
const jp = require('jsonpath')
const url = require('url');
const qs = require('query-string');

const app = express()
const port = 4400
const fs = require('fs')

app.use(cors())

const HTTP_STATUS_TC_NOT_FOUND = 418;

const getResponseForReq = (collection, req, res) => {

    console.log('Incoming request: ', req);

    let queryParams = qs.stringify(req.query);
    console.log('Query params: ', queryParams);

    let testCaseParams = [];

    collection.path.responses.forEach(r => {
        let actItem = {
            name: r.name,
            code: r.code,
            params: qs.stringify(qs.parse(r.originalRequest.url.query.filter(r => r.disabled != true).map(t => `${t.key}=${t.value}`).join('&'))),
            body: r.body
        }
        testCaseParams.push(actItem);
    });

    let resCode = HTTP_STATUS_TC_NOT_FOUND;
    let resBody = '';
    let found = false;

    for (testCase of testCaseParams) {  
        console.log('Act test case params: ', testCase);

        if (queryParams == testCase.params) {
            resCode = testCase.code;
            resBody = JSON.parse(testCase.body);
            found = true;
            
            break;
        }
    }

    if (found) {
        console.log('Found test case for the request: ', queryParams);
    } else {
        console.log('No test case found for the query:', queryParams);
    }

    console.debug('Replying response: ', res.statusCode, ' - ', resBody);

    res.status(resCode);
    res.json(resBody);

    return res;
}

const compiledCollection = [];

fs.readdir('./collections', (err, files) => {
    if(err) return console.error(err);

    files.forEach(file => {
        if(!file.endsWith('.json')) return;
        try {

            console.log('\nProcessing collection: ', file, ' ...');

            let raw = fs.readFileSync(`./collections/${file}`);
            let collection = JSON.parse(raw);

            let actApi = {api: file.split('.')[0], path: undefined};
            let requests = jp.query(collection, '$..request');

            requests.forEach(request => {
                let exportedPath =  `/${actApi.api}/api/${request.url.path.join('/')}`;
                let responses = jp.query(collection, `$..response[?(@.originalRequest.url.path == "${request.url.path[0]}" && @.originalRequest.method=="${request.method}")]`);
                let path = {path: exportedPath, responses: responses};

                actApi.path = path;

                compiledCollection.push(actApi);

                console.log('  Mounting route : ', request.method, exportedPath);

                app[request.method.toLowerCase()](exportedPath, (req, res) => {
                    getResponseForReq(actApi, req, res);
                });
            });
        } catch (error) {
            console.error(error)
        }
    });

    console.log(`\n${compiledCollection.length} routes mounted.`);

    app.listen(port, () => {
        console.log(`\Listening at http://localhost:${port}`)
    });
});