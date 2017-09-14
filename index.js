'use strict';

const fs      = require('fs');
const riot    = require('riot');
const Module  = require('module');
let debug     = true;
let views     = {};


const root = {
  html: '',
  scripts: ''
}

/** Can skip the express engine bs and add this code

  //load to express res
  express.response.riotTagRender = exriot(cfg);

  //use in route
  res.send(res.riotTagRender('main-page', opts));

  //express res.render way
  app.engine('html', exriot(cfg));
  app.set('views', cfg.viewPath);
  app.set('view engine', 'html');

  //use in route
  res.render('/pages/main.page.html');

*/

exports.init = init;
exports.initMixins = initMixins;
exports.render = render;
exports.riotTagRoute = tagRoute;
exports.cleantRequire = cleantRequire;

exports.riotTagRender = (cfg) => {
  init(cfg);
  return render;
};


/** loads all riot tags in the cfg.viewPath and compiles root html and scripts */

function init(cfg = { rootFilePath: '', viewPath: '', appPath: '', skipViews: ['app.tag.html'] }){
  requireViews(cfg.viewPath, cfg.skipViews, () => {
    root.html = fs.readFileSync(cfg.rootFilePath, 'utf8');
    root.scripts = generateScripts(cfg.appPath);
  });
}

function initMixins(mixins = {}, extras = {}){
  if(!Object.keys(mixins).length)
    return;

  for(let mixinName in mixins){
    //let mixin = mixins[mixinName];
    //console.log(typeof mixin === 'function');
    riot.mixin(mixinName, mixins[mixinName]);
  }
}


/** */

function render(filePath, opts = { stores: {}}, cb){



  if(!filePath)
    return console.log(new Error('filePath is not defined. Check if route has "view" value'));

  let TAG, HTML, FULL_HTML;
  //renders rootHtml only when filePath is opts object
  if(typeof filePath !== 'object'){
    debug && console.log(`Riot view Rendered '${filePath}'`);
    TAG       = filePath.includes('.') ? compileRiot(filePath) : filePath;
    HTML      = riot.render(TAG, { stores: opts.stores, SERVER: true });
  }

  let content = opts.stores && opts.stores.appStore && opts.stores.appStore.getOpts();

  FULL_HTML = riot.util.tmpl(root.html, { opts: content || opts, HTML, SCRIPTS: root.scripts });

  return !cb ? FULL_HTML : cb(null, FULL_HTML);
};


/** */


function tagRoute(req, res, next){
  let _riotTagHtml, _tagName = req.params.tag;
  //if(!tagName.includes('.html')) return next();
  let opts = {
    stores: res.stores,
    content: res.content,
    poinject: res.poinject,
    route: {},
    SERVER: true
  };

  _tagName = _tagName || opts.content.routes && Object.keys(opts.content.routes).shift();

  /** renders only rootHtml */
  if(!_tagName) return res.send(render(opts));

  /** content modifications for specific route */
  if(opts.content.routes){
    opts.route = opts.content.routes[_tagName];
    opts.stores.appStore && opts.stores.appStore.setActiveRoute(_tagName);
    return res.send(render(opts.route.view, opts))
  }
  else
    console.log('WARRNING: content routes are not set');

  res.send(render(_tagName, opts));
  //res.render('page/main.page.html', content);
  //res.send(res.riotTagRender(content))
}

/** loads client js function or class to server
    alternative: is to add at the end of the file
    class appStore{}
    if(typeof module !== 'undefined'){ module.exports = appStore }
*/
function cleantRequire(filePath, code){
  code = code || fs.readFileSync(filePath, 'utf8');
  let paths = Module._nodeModulePaths(__dirname);
  code = `
    var riot = require('riot');
    module.exports = ${ code }
  `;
	var m = new Module(filePath, module.parent);
	m.filename = filePath;
	m.paths = paths;
	m._compile(code, filePath);
  return m.exports;
}

function requireViews(path, skipViewFiles, cb){
  fs.readdir(path, (err, files) => {
    if(err){ return new Error(err); }
    //console.log(files);

    let _loadedTagCount = 0;
    let _filePath, _fileStats;
    files.forEach((filename) => {

      _filePath = `${path}/${filename}`;
      _fileStats = fs.lstatSync(_filePath);

      if(!!_fileStats.isDirectory()){
        _loadedTagCount++;
        return requireViews(_filePath, skipViewFiles, cb);
      }

      if(!_fileStats.isFile() || skipViewFiles && skipViewFiles.indexOf(filename) >= 0){
        //console.log(_filePath, 'not file or skipviewfile');
        debug && console.log(`Riot view Skiped '${_filePath}'`);
        _loadedTagCount++;
        return;
      }

      compileRiot(_filePath, () => {
        debug && console.log(`Riot view Compiled '${_filePath}'`);
        _loadedTagCount++;
        views ? views[filename] = _filePath : false;
        _loadedTagCount === files.length && cb && cb();
      });

    });
  });
}

function generateScripts(appPath){
  let _filePath, SCRIPTS = '';
  if(Object.keys(views).length){
    for(let view in views){
      _filePath = `.${views[view].replace(appPath, '')}`;
      SCRIPTS += `<script type="riot/tag" data-src="${_filePath}" defer></script>\n`;
    }
  }
  //console.log(SCRIPTS);

  return SCRIPTS;
}

function compileRiot(filePath, cb){
  let mExport = cleantRequire(filePath, riot.compile(fs.readFileSync(filePath, 'utf8')));

	if(!!cb)
    return cb();

  return mExport;
}
