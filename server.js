const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
app.get('/health', (req,res)=>res.json({status:'ok', svc:'user'}));
app.get('/users', (req,res)=>res.json([{id:1,name:'Alice'}]));
app.listen(port,()=>console.log(`user-service listening ${port}`));
