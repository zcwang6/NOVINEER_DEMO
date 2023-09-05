import initOpenCascade from "opencascade.js";
import { loadSTEPorIGES, CreateVolumeToFaceMap } from '../../common/occHelpers';
import { vtkRun } from "../../common/vtkUtils";


const addShapeToScene = async (openCascade, shape) => {
  var isVolumeMode = false;
  var v2fMap = CreateVolumeToFaceMap(openCascade, shape)
  vtkRun(openCascade, shape, v2fMap, isVolumeMode);
}

initOpenCascade().then(openCascade => {
  // Allow users to upload STEP Files by either "File Selector" or "Drag and Drop".
  document.getElementById("step-file").addEventListener(
    'input', async (event) => { await loadSTEPorIGES(openCascade, event.srcElement.files[0], addShapeToScene); });
  document.body.addEventListener("dragenter", (e) => { e.stopPropagation(); e.preventDefault(); }, false);
  document.body.addEventListener("dragover", (e) => { e.stopPropagation(); e.preventDefault(); }, false);
  document.body.addEventListener("drop", (e) => {
    e.stopPropagation(); e.preventDefault();
    if (e.dataTransfer.files[0]) { loadSTEPorIGES(openCascade, e.dataTransfer.files[0], addShapeToScene); }
  }, false);
});
