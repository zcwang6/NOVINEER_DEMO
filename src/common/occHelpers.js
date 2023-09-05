const loadFileAsync = (file) => {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  })
}

function CreateVolumeToFaceMap(openCascade, oneShape) {
  // final map
  var volumeToFaceMap = new Map()
  // volume id and face id
  // NOTE: all id starts from 1 in opencascade
  let iVolume = 0
  let iFace = 0

  const expSolid = new openCascade.TopExp_Explorer_1()
  for (expSolid.Init(oneShape, openCascade.TopAbs_ShapeEnum.TopAbs_SOLID, openCascade.TopAbs_ShapeEnum.TopAbs_SHAPE); expSolid.More(); expSolid.Next()) {
    const currSolid = openCascade.TopoDS.Solid_1(expSolid.Current());
    iVolume++

    const expFace = new openCascade.TopExp_Explorer_1()
    for (expFace.Init(currSolid, openCascade.TopAbs_ShapeEnum.TopAbs_FACE, openCascade.TopAbs_ShapeEnum.TopAbs_SHAPE); expFace.More(); expFace.Next()) {
      iFace++
      if (!volumeToFaceMap.has(iVolume)) {
        volumeToFaceMap.set(iVolume, []);
      }
      volumeToFaceMap.get(iVolume).push(iFace);
    }
  }
  // print the volume-face map
  //console.log(volumeToFaceMap)
  return volumeToFaceMap
} export { CreateVolumeToFaceMap }

const loadSTEPorIGES = async (openCascade, inputFile, addFunction) => {
  await loadFileAsync(inputFile).then(async (fileText) => {
    const fileType = (() => {
      switch (inputFile.name.toLowerCase().split(".").pop()) {
        case "step":
        case "stp":
          return "step";
        case "iges":
        case "igs":
          return "iges";
        default:
          return undefined;
      }
    })();
    // Writes the uploaded file to Emscripten's Virtual Filesystem
    openCascade.FS.createDataFile("/", `file.${fileType}`, fileText, true, true);

    // Choose the correct OpenCascade file parsers to read the CAD file
    var reader = null;
    if (fileType === "step") {
      reader = new openCascade.STEPControl_Reader_1();
    }
    else if (fileType === "iges") {
      reader = new openCascade.IGESControl_Reader_1();
    }
    else {
      console.error("Not supported input file!");
    }

    const readResult = reader.ReadFile(`file.${fileType}`);
    if (readResult === openCascade.IFSelect_ReturnStatus.IFSelect_RetDone) {
      console.log("File is Loaded!");
      const numRootsTransferred = reader.TransferRoots(new openCascade.Message_ProgressRange_1());
      const stepShape = reader.OneShape();
      console.log(inputFile.name + " converted successfully! ");

      // TODO: Remove previous objects...
      await addFunction(openCascade, stepShape);
      console.log(inputFile.name + " is triangulated and added to the render window!");

      // Remove the file when we're done (otherwise we run into errors on reupload)
      openCascade.FS.unlink(`/file.${fileType}`);
    }
    else {
      console.error("Fail to read geometry from " + inputFile.name);
    }
  });
};
export { loadSTEPorIGES };

