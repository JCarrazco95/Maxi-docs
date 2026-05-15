# Stack Específico del Proyecto — Sistema de Firma de Documentos

## Fabric.js — Drag and drop de campos sobre PDF
- Versión recomendada: fabric@6.x
- Instalar: `npm install fabric`
- Crear canvas: `new fabric.Canvas('c', { selection: true })`
- Agregar campo de firma: `canvas.add(new fabric.Textbox('Firma aquí', { left: 100, top: 100, width: 200 }))`
- Serializar para guardar en DB: `canvas.toJSON()`
- Cargar desde DB: `canvas.loadFromJSON(savedJson)`
- Evento cuando mueven un campo: `canvas.on('object:modified', handler)`
- Evento cuando agregan campo: `canvas.on('object:added', handler)`

## PDF.js — Render de PDF en el browser
- Versión recomendada: pdfjs-dist@4.x
- Instalar: `npm install pdfjs-dist`
- Configurar worker: `pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.min.js'`
- Cargar PDF: `const pdf = await pdfjsLib.getDocument(url).promise`
- Obtener página: `const page = await pdf.getPage(1)`
- Renderizar en canvas: `await page.render({ canvasContext: ctx, viewport }).promise`
- SIEMPRE renderizar en `<canvas>` y poner el canvas de Fabric.js encima con position: absolute

## Socket.io — Colaboración en tiempo real
- Instalar servidor: `npm install socket.io`
- Instalar cliente: `npm install socket.io-client`
- Rooms por documento: `socket.join('doc:' + docId)`
- Emitir cuando alguien firma: `io.to(room).emit('field:signed', { fieldId, userId })`
- Emitir quién está viendo: `io.to(room).emit('user:viewing', { userId, page })`
- Cliente escucha: `socket.on('field:signed', (data) => updateUI(data))`

## BullMQ + Redis — Cola de jobs
- Instalar: `npm install bullmq ioredis`
- Crear queue: `new Queue('pdf-generation', { connection: redisConnection })`
- Agregar job: `queue.add('generate', { docId, recipientEmail }, { attempts: 3, backoff: 5000 })`
- Worker que procesa: `new Worker('pdf-generation', async (job) => { /* generar PDF */ })`
- Monitorear jobs: usar Bull Board — `npm install @bull-board/express`

## Resend — Emails transaccionales
- Instalar: `npm install resend`
- Inicializar: `const resend = new Resend(process.env.RESEND_API_KEY)`
- Enviar email: `await resend.emails.send({ from: 'noreply@tudominio.com', to: email, subject: 'Firma requerida', html: template })`
- Para templates profesionales: `npm install @react-email/components`
- Webhooks para saber si abrieron el email: configurar en dashboard de Resend

## Arquitectura general del flujo
1. Usuario sube PDF → guardarlo en storage (S3 o local)
2. Renderizar PDF con PDF.js en canvas
3. Usuario arrastra campos de firma con Fabric.js encima del canvas
4. Guardar posiciones de campos en DB (canvas.toJSON())
5. Enviar a firmantes por email con Resend
6. Firmante abre link → ve el PDF con campos → firma
7. Socket.io notifica en tiempo real al dueño del documento
8. BullMQ genera el PDF final con las firmas incrustadas
