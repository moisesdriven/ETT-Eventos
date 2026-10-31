# Copia este archivo como config.ps1 y completa los datos de tu servidor.
# config.ps1 no se sube a GitHub (está en .gitignore).

# IP o nombre del VPS de Contabo
$Servidor = '144.91.106.148'

# Usuario SSH (los scripts asumen root para instalar Docker)
$Usuario = 'root'

# Puerto SSH
$Puerto = 22

# Carpeta del proyecto en el servidor (ruta absoluta)
$Carpeta = '/opt/ett-eventos'

# Repositorio (público) y rama a desplegar; cambia a 'main' cuando el pull request esté fusionado
$RepoUrl = 'https://github.com/moisesdriven/ETT-Eventos.git'
$Rama = 'claude/inspiring-lamport-0y4obi'

# Carpeta de tu PC donde se descargan los respaldos
$CarpetaRespaldosLocal = 'C:\Respaldos\ett-eventos'
