<?php
// Cartella dove si trovano i brani
$dir = "public/bgTracks/";
$tracks = [];

if (is_dir($dir)) {
    // Cerca tutti i file .mp3
    $files = glob($dir . "*.mp3");
    foreach ($files as $file) {
        $tracks[] = basename($file);
    }
}

// Restituisce la lista in formato JSON per il JavaScript
header('Content-Type: application/json');
echo json_encode($tracks);
?>
