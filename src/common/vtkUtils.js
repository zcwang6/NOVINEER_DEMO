import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import vtkRenderWindow from '@kitware/vtk.js/Rendering/Core/RenderWindow';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkPoints from "@kitware/vtk.js/Common/Core/Points";
import vtkCellArray from "@kitware/vtk.js/Common/Core/CellArray";
import vtkTriangle from "@kitware/vtk.js/Common/DataModel/Triangle";
import vtkCalculator from '@kitware/vtk.js/Filters/General/Calculator';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCell from '@kitware/vtk.js/Common/DataModel/Cell';
import vtkCone from '@kitware/vtk.js/Common/DataModel/Cone';
import vtkConeSource from '@kitware/vtk.js/Filters/Sources/ConeSource';
import vtkFPSMonitor from '@kitware/vtk.js/Interaction/UI/FPSMonitor';
import vtkRenderWindowInteractor from '@kitware/vtk.js/Rendering/Core/RenderWindowInteractor';
import vtkInteractorStyleManipulator from '@kitware/vtk.js/Interaction/Style/InteractorStyleManipulator';
import vtkInteractorStyleTrackballCamera from '@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera';
import vtkPicker from '@kitware/vtk.js/Rendering/Core/Picker';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkOpenGLHardwareSelector from '@kitware/vtk.js/Rendering/OpenGL/HardwareSelector';
import FieldAssociations from '@kitware/vtk.js/Common/DataModel/DataSet/Constants';
import vtkTriangleFilter from '@kitware/vtk.js/Filters/General/TriangleFilter';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkMath from '@kitware/vtk.js/Common/Core/Math';

// some colors...
const VTK_COLOR_GREEN  = [0.0, 1.0, 0.0]
const VTK_COLOR_RED    = [1.0, 0.0, 0.0]
const VTK_COLOR_GRAY   = [0.70, 0.70, 0.82]
const VTK_COLOR_BLUE   = [0.20, 0.20, 0.40]
const VTK_COLOR_ORANGE = [0.90, 0.59, 0.26]
// system colors
const COLOR_FACE           = VTK_COLOR_GRAY
const COLOR_FACE_HIGHLIGHT = VTK_COLOR_ORANGE

function GetHighlightStatus(faceId, highligtArray, volumeToFaceMap, isVolumeMode) {
  let isHighlighted = false;
  if (isVolumeMode) {
    let volumeId = 0;
    for (const [key, value] of volumeToFaceMap) {
      if (value.includes(faceId)) {
        volumeId = key;
        break;
      }
    }

    if (volumeId > 0 && highligtArray.includes(volumeId))
      isHighlighted = true;
  }
  else {
    if (highligtArray.includes(faceId))
      isHighlighted = true;
  }

  return isHighlighted;
}

function NeedFlip(testNormal, tri) {
  let vec1 = [tri[2][0] - tri[0][0], tri[2][1] - tri[0][1], tri[2][2] - tri[0][2]]
  let vec2 = [tri[1][0] - tri[0][0], tri[1][1] - tri[0][1], tri[1][2] - tri[0][2]]

  const crossProduct = [];
  vtkMath.cross(vec1, vec2, crossProduct);

  return vtkMath.dot(testNormal, crossProduct) > 0;
}

function vtkRun(openCascade, shapes, volumeToFaceMap, isVolumeMode) {
  // main renderer
  const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
    background: VTK_COLOR_BLUE,
  })

  // Note: This is list of highlighted face/volume Ids, please retrieve
  // them from database.  This information need to get from S3
  let highligtArray = [2, 4];// format int [2,4]

  // current renderer
  var renderer = fullScreenRenderer.getRenderer();
  // current render window
  var renderWindow = fullScreenRenderer.getRenderWindow();

  // faceting all the shapes
  try {
    //in case some of the faces can not been visualized
    let mesh = new openCascade.BRepMesh_IncrementalMesh_2(shapes, 0.1, false, 0.5, false);
  }
  catch (e) {
    console.error('Fail to mesh current face!');
  }

  let faceId = 0
  const expFace = new openCascade.TopExp_Explorer_1();
  for (expFace.Init(shapes, openCascade.TopAbs_ShapeEnum.TopAbs_FACE, openCascade.TopAbs_ShapeEnum.TopAbs_SHAPE); expFace.More(); expFace.Next()) {
    const currShape = expFace.Current();
    const currFace = openCascade.TopoDS.Face_1(currShape);
    faceId++; // current face id

    // get triangulation and location object
    const aLocation = new openCascade.TopLoc_Location_1();
    const triangulation = openCascade.BRep_Tool.Triangulation(currFace, aLocation, 0);
    if (triangulation.IsNull()) {
      console.log("No triangulation created in this face. ", faceId)
      continue;
    }
    const triangulationData = triangulation.get();

    // extract all cell info
    // NOTE: vtk index starts from 0 and opencascade index starts from 1
    const cells = []
    for (var i = 1; i <= triangulationData.NbTriangles(); i++) {
      const tri = triangulationData.Triangles().Value(i);
      cells.push(3)
      cells.push(tri.Value(1) - 1)
      cells.push(tri.Value(2) - 1)
      cells.push(tri.Value(3) - 1)

      tri.delete()
    }

    // extract all node info
    var points = vtkPoints.newInstance();
    for (var i = 1; i <= triangulationData.NbNodes(); i++) {
      const pt = triangulationData.Node(i).Transformed(aLocation.Transformation());
      points.insertNextPoint(pt.X(), pt.Y(), pt.Z());

      pt.delete();
    }

    // extract all face normals
    const pc = new openCascade.Poly_Connect_2(triangulation);
    const myNormal = new openCascade.TColgp_Array1OfDir_2(1, triangulationData.NbNodes());

    openCascade.StdPrs_ToolTriangulatedShape.ComputeNormals_2(currFace, triangulation, pc)
    openCascade.StdPrs_ToolTriangulatedShape.Normal(currFace, pc, myNormal);

    // test the first triangle to see if we need to flip the face normal
    let testTri = [points.getPoint(cells[1]), points.getPoint(cells[2]), points.getPoint(cells[3])]

    const normal1 = myNormal.Value(cells[1] + 1).Transformed(aLocation.Transformation())
    const normal2 = myNormal.Value(cells[2] + 1).Transformed(aLocation.Transformation())
    const normal3 = myNormal.Value(cells[3] + 1).Transformed(aLocation.Transformation())

    let needFlip1 = NeedFlip([normal1.X(), normal1.Y(), normal1.Z()], testTri);
    let needFlip2 = NeedFlip([normal2.X(), normal2.Y(), normal2.Z()], testTri);
    let needFlip3 = NeedFlip([normal3.X(), normal3.Y(), normal3.Z()], testTri);
    // for now, do flip if all
    let needFlip = needFlip1 && needFlip2 && needFlip3;

    let normals = new Float32Array(myNormal.Length() * 3);
    for (let i = myNormal.Lower(); i <= myNormal.Upper(); i++) {
      const currNormal = myNormal.Value(i).Transformed(aLocation.Transformation());

      normals[3 * (i - 1) + 0] = !needFlip ? currNormal.X() : -currNormal.X();
      normals[3 * (i - 1) + 1] = !needFlip ? currNormal.Y() : -currNormal.Y();
      normals[3 * (i - 1) + 2] = !needFlip ? currNormal.Z() : -currNormal.Z();

      currNormal.delete();
    }

    myNormal.delete();

    // Create a vtkDataArray to store the normals
    const normalsArray = normals;
    const normalDataArray = vtkDataArray.newInstance({
      name: 'Normals',
      numberOfComponents: 3, // 3 components (x, y, z) per normal vector
      values: normalsArray,
    });

    var polyData = vtkPolyData.newInstance();
    polyData.setPoints(points);
    polyData.getPointData().setNormals(normalDataArray);
    polyData.getPolys().setData(cells)

    // creater mapper
    var mapper = vtkMapper.newInstance();
    mapper.setInputData(polyData)
    // create actor
    var actor = vtkActor.newInstance();
    actor.setMapper(mapper)

    // check out highlight status
    // @Bermil: Here you have to build up your own highlightArray, for example
    // In volume selection mode (non-design and design): fetch all volume ids stored in your database
    // In face selection mode: fetch all face ids stored in your database
    // NOTE: In this way, please initialize the following bufferFaceList/bufferVolumeList with your database,
    // because buffer list does not know the current database, you have to sync the data (selected face id or volume id).
    let isHighlight = GetHighlightStatus(faceId, highligtArray, volumeToFaceMap, isVolumeMode)
    console.log(faceId, isHighlight)
    actor.getProperty().setColor(isHighlight ? COLOR_FACE_HIGHLIGHT: COLOR_FACE);
    if (isHighlight)
      actor.getProperty().setSpecular(0.5)

    renderer.addActor(actor);
  }
  expFace.delete();
  // end of rendering codes

  const apiSpecificRenderWindow = fullScreenRenderer.getApiSpecificRenderWindow();
  // setup selector
  const hardwareSelector = apiSpecificRenderWindow.getSelector();
  hardwareSelector.setCaptureZValues(true);
  //TODO: error message will be output here.
  //hardwareSelector.setFieldAssociation(FieldAssociations.FIELD_ASSOCIATION_CELLS);

  // set up interactor stype object
  var interactorStyle = vtkInteractorStyleTrackballCamera.newInstance()
  var renderWindowInteractor = fullScreenRenderer.getInteractor();
  renderWindowInteractor.setInteractorStyle(interactorStyle);

  // this is selected face/volume // list save into S3
  let bufferFaceList   = new Array();
  let bufferVolumeList = new Array();

  for (let i = 0; i < highligtArray.length; i++)
  {
    if (isVolumeMode) {
      bufferVolumeList.push(highligtArray[i]);

      let facesIncluded = volumeToFaceMap.get(highligtArray[i]);

      for (let ii=0; ii<facesIncluded.length; ++ii)
        bufferFaceList.push(facesIncluded[ii]);
    }
    else {
      bufferFaceList.push(highligtArray[i]);
    }
  }

  console.log(bufferVolumeList)

  // selection callback
  function processSelections(selections, isDeselect) {
    if (!selections || selections.length === 0) {
      return;
    }

    const {
      worldPosition: rayHitWorldPosition,
      compositeID,
      prop,
      propID,
      attributeID,
    } = selections[0].getProperties();

    if (prop != null) {
      let facesToHandle = []
      let volumeToHandle = 0

      var pickedFaceId = 0
      // Get all actors ready
      var actorCollections = renderer.getActors()
      const numActors = actorCollections.length

      for (var iActor = 0; iActor < numActors; ++iActor) {
        var currActor = actorCollections[iActor]
        if (currActor == prop) {
          pickedFaceId = iActor + 1
          console.log("Picked Face Id:", pickedFaceId)

          if (isVolumeMode) {
            for (const [key, value] of volumeToFaceMap) {
              if (value.includes(pickedFaceId)) {
                facesToHandle = value
                volumeToHandle = key

                console.log("Picked Volume Id:", volumeToHandle)
                console.log("Faces from according volume:", facesToHandle)
                break
              }
            }
          }
          else {
            facesToHandle.push(pickedFaceId)
          }
        }
      }

      // return if no candidate found
      if (facesToHandle.length === 0)
        return

      // Highligt the faces and update buffer
      for (var iActor = 0; iActor < numActors; ++iActor) {
        var currActor = actorCollections[iActor]

        if (facesToHandle.includes(iActor + 1)) {
          if (!isDeselect && !bufferFaceList.includes(iActor + 1)) {
            bufferFaceList.push(iActor + 1)
            currActor.getProperty().setColor(COLOR_FACE_HIGHLIGHT);
            currActor.getProperty().setSpecular(0.5)
          }
          else if (isDeselect && bufferFaceList.includes(iActor + 1)) {
            const index = bufferFaceList.indexOf(iActor + 1);
            if (index !== -1) {
              bufferFaceList.splice(index, 1);
            }
            currActor.getProperty().setColor(COLOR_FACE);
            currActor.getProperty().setSpecular(0.0)
          }
        }
      }

      // update volume buffer
      if (isVolumeMode) {
        if (!isDeselect && !bufferVolumeList.includes(volumeToHandle))
          bufferVolumeList.push(volumeToHandle)
        else if (isDeselect && bufferVolumeList.includes(volumeToHandle)) {
          const index = bufferVolumeList.indexOf(volumeToHandle);
          if (index !== -1) {
            bufferVolumeList.splice(index, 1);
          }
        }
      }

      // statistics
      if (isVolumeMode) {
        console.log("selected volumes:", bufferVolumeList)
        console.log("number of selected volumes:", bufferVolumeList.length)
      }
      else {
        console.log("selected faces:", bufferFaceList)
        console.log("number of selected faces:", bufferFaceList.length)
      }
    }

    renderWindow.render();
  }

  renderWindowInteractor.onLeftButtonPress((event) => {
    if (event !== undefined) {
      const pos = event.position;
      // left click = select, shift + left click = deselect
      const isDeselect = event.shiftKey;
      hardwareSelector.getSourceDataAsync(renderer, pos.x, pos.y, pos.x, pos.y).then((result) => {
        if (result) {
          processSelections(result.generateSelection(pos.x, pos.y, pos.x, pos.y), isDeselect);
        } else {
          processSelections(null, isDeselect);
        }
      });

      renderWindow.render();
    }
    else
      console.log("Bad Event!");
  });

  renderWindowInteractor.initialize()
  renderer.resetCamera();
  renderWindow.render();
  renderWindowInteractor.start()
}
export { vtkRun };
