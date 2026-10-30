# Copia este archivo como config.ps1 y completa los datos de tu servidor.
# config.ps1 no se sube a GitHub (está en .gitignore).

# IP o nombre del VPS de Contabo
$Servidor = 'IP_DEL_SERVIDOR'

# Usuario SSH (los scripts asumen root para instalar Docker)
$Usuario = 'root'

# Puerto SSH
$Puerto = 22

# Carpeta del proyecto en el servidor, relativa a la carpeta personal del usuario
$Carpeta = 'ett-eventos'

# Repositorio y rama a desplegar (usa 'main' cuando el pull request esté fusionado)
$RepoUrl = 'https://github.com/moisesdriven/ett-eventos.git'
$Rama = 'main'

# Carpeta de tu PC donde se descargan los respaldos
$CarpetaRespaldosLocal = 'C:\Respaldos\ett-eventos'
