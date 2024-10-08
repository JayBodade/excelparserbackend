const express = require('express');
const app = express();
const xlsx = require('xlsx');
const axios = require('axios');
const fs = require('fs');
const morgan = require('morgan');
const docparser = require('docparser-node');
const readXlsxFile = require('read-excel-file/node');
const connectToDb = require('./database/init');
const TemplateModel = require('./database/model/teamplate');
const cors = require('cors');
require('dotenv').config();

app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

let fileCounter = 1;
var client = new docparser.Client(process.env.DOCPARSER_API);

function authUser() {
    client.ping().then((data) => {
        console.log('authentication succeeded!');
    }).catch((e) => {
        console.log('authentication failed!', e)
    })
}

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    return res.status(200).json("welcome to excel parser backend");
});

app.post('/uploadexcel', async (req, res) => {
    try {
        const { url, template_Id } = req.body;
        console.log(Date.now());
        if (!url || !template_Id) {
            return res.status(400).json({ success: false, message: "Missing URL or template ID" });
        }

        let parser = await TemplateModel.findOne({ templateId: template_Id });
        if (!parser) {
            return res.status(404).json({ success: false, message: "Parser not found with the given ID" });
        }

        const response = await axios.get(url, {
            responseType: 'arraybuffer'
        });

        if (response.data.length === 0) {
            return res.status(400).json({ success: false, message: "File is empty" });
        }

        const workbook = xlsx.read(response.data, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const newWorkbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(newWorkbook, sheet, sheetName);
        const filePath = `file${fileCounter}.xlsx`;
        xlsx.writeFile(newWorkbook, filePath);
        const parserData = await readXlsxFile(fs.createReadStream(filePath));
        let responseData = {};

        if (parserData) {
            (parser.fieldData || []).forEach((ele) => {
                if (ele.name && ele.row && ele.col) {
                    const rowIndex = parseInt(ele.row) - 1;
                    const colIndex = parseInt(ele.col) - 1;

                    if (parserData[rowIndex] && parserData[rowIndex][colIndex] !== undefined) {
                        responseData[ele.name] = parserData[rowIndex][colIndex];
                    } else {
                        console.log(`Invalid field data at row ${rowIndex + 1}, col ${colIndex + 1}`);
                    }
                } else {
                    console.log(`Invalid field data: ${JSON.stringify(ele)}`);
                }
            });

            const tableRow = parseInt(parser.tableData?.row);
            const tableCols = parseInt(parser.tableData?.col);
            let table = [];
            let tableheaders = [];

            if (!isNaN(tableRow) && !isNaN(tableCols) && tableRow > 0 && tableCols > 0) {
                tableheaders = parserData[tableRow - 1] || [];
                for (let i = tableRow ; i < parserData.length; i++) {
                    
                    if (checkifFullRowisNull(parserData[i])) break;
                    else {
                        let obj = forObjectFromData(tableheaders,parserData[i]);
                        table.push(obj);
                    }
                }
               
            } else {
                console.log("Invalid table row or column numbers");
            }

            responseData[parser.tableData?.name] = table;

            const summaryRowIndex = findRow(parser.summary.text, parseInt(parser.summary.colnumber) - 1, parserData);
            console.log(summaryRowIndex);
            const resummary = {};

            if (summaryRowIndex >= 0) {
                const totalRow = parserData[summaryRowIndex];
                tableheaders.forEach((element, index) => {
                    resummary[element] = totalRow[index] === parser.summary.text ? '-' : totalRow[index];
                });
            } else {
                console.warn("Summary row not found");
            }

            responseData.resummary = resummary;

            setTimeout(() => {
                fs.unlink(filePath, (err) => {
                    if (err) {
                        console.error('Error deleting file:', err);
                        return;
                    }

                    console.log(`Deleted ${filePath}`);
                });
            }, 5 * 60 * 1000); // 5 minutes

            fileCounter++;
            return res.json({ success: true, responseData });

        } else {
            return res.status(500).json({ success: false, message: "Error in parsing Excel file" });
        }

    } catch (error) {
        console.error("Error processing Excel file:", error);
        return res.status(500).json({ success: false, error: 'Failed to process Excel file' });
    }
});

function checkifFullRowisNull(arr) {
    return arr.every(element => element == null);
}

function findRow(searchText, colIndex, data) {
    for (let i = 0; i < data.length; i++) {
        if (data[i][colIndex] === searchText) {
            return i;
        }
    }
    return -1;
}

function forObjectFromData(headers,data){

    let obj = {};
    
    for (let i = 0; i < headers.length; i++) {
        obj[headers[i]] = data[i] !== undefined ? data[i] : null;
    }

    return obj;

}


app.post('/addtemplate', async (req, res) => {

    try {
        console.log(req.body);
        const { data } = req.body;
        if (data) {
            data.templateId = data.templateName + '_' + generateRandomString(12);
            let template = await TemplateModel.create(data);
            if (template) {
                return res.json({ success: true, message: 'Template Created Successfully', template });
            } else {
                return res.json({ success: false, message: "Something went wrong while creating a template" });
            }
        } else {
            return res.json({ success: false, message: "data not found" });
        }
    } catch (e) {
        return res.json("Something Went Wrong", e);
    }


})

app.post('/uploadpdf', async (req, res) => {
    let document = null;
    try {
        let { url, template_Id } = req.body;
         document = await client.fetchDocumentFromURL(template_Id, url, { remote_id: 'test' })
        if (document) {
            let parsedData = await client.getResultsByDocument(template_Id, document.id, { format: 'object' })
            return res.json({success:true,isPending:false,parsedData});
        } else {
            return res.json({ success: false, message: "Something went wrong while uploading document" });
        }
    } catch (e) {
       if(e.statusCode == 400){
        return res.json({success:true,isPending:true,message:"File is generated but not processed yet !!!",document_Id:document.id})
       }else{
        return res.json({ success: false, message: e });
       }
    }
})

app.post('/getparseddata',async(req,res)=>{
   
    try{
        let {document_Id,template_Id} = req.body;
        let parsedData = await client.getResultsByDocument(template_Id, document_Id, { format: 'object' })
        if(parsedData){
            return res.json({success:true,parsedData});
        }else{
            return res.json({success:false,message:'error while parsing data'});
        }
        
    }catch(e){
            return res.json({success:false,message:e.message});
    }

})

app.get('/alltemplates', async (req, res) => {
    try {
        let all_templates = await TemplateModel.find();
        return res.json({ success: true, all_templates });
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
})

app.put('/updatetemplate', async (req, res) => {

    try {
        console.log(req.body);
        let { data } = req.body;
        let { template_Id } = req.query;
        if (data) {
            let updatedStatus = await TemplateModel.findByIdAndUpdate({ _id: template_Id }, data);

            return res.json({ success: true,message: "template updated successfully" });
        } else {
            return res.json({ success: false, message: 'Body Not Found' });
        }
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
})


app.delete('/deletetemplate', async (req, res) => {
    try {
        let { template_Id } = req.query;
        let template = await TemplateModel.findById(template_Id);
        let deletedTemplate = await TemplateModel.findByIdAndDelete(template_Id);
        return res.json({ success: true, message: 'template deleted successfully' });
    } catch (e) {
        return res.json({ success: false, message: e.message })
    }
})

app.get('/getParsers', async (req, res) => {
    try {
        let parsers = await client.getParsers();
        return res.json({ success: true, parsers });
    } catch (e) {
        return res.json({ success: false, message: e.message });
    }
})


async function checkFileParsed(parser_id, docId) {
    try {
        let parsedData = await client.getResultsByDocument(parser_id, docId, { format: 'object' })
        return parsedData;
    } catch (e) {
        console.log("File is not parsed yet");
        return null;
    }
}

function generateRandomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters[randomIndex];
    }
    return result;
}




// http://localhost:3000/deletetemplate?id=123
app.delete('/delete', (req, res) => {
    return res.json("in delete api");
})

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    connectToDb();
    authUser();
});
