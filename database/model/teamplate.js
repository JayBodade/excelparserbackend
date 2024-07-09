const  mongoose = require('mongoose');

const TemplateSchema = new mongoose.Schema({
    templateName: String,
    templateId:String,
    fieldData: [{
      name: String,
      row: String,
      col: String
    }],
    tableData: {
      name: String,
      row: String,
      col: String
    },
    summary: {
      name: String,
      text: String,
      colnumber: String
    }
  });

  const TemplateModel = mongoose.model('template',TemplateSchema);

  module.exports = TemplateModel;