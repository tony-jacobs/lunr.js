Search.Index = function (name) {
  this.name = name
  this.fields = {} // by default no fields will be indexed
  this.wordStore = new Search.Store (name + "-words")
  this.docStore = new Search.Store (name + "-docs")

  this.adding = false

  // do this elsewhere???
  this.wordStore.init(function () { console.log('wordStore initialized') })
  this.docStore.init(function () { console.log('docStore initialized') })
}

Search.Index.prototype = {

  addList: function (objs) {
    var self = this
    var deferred = new Search.Deferred ()
    var obj = objs.pop()
    self.add(obj).then(function () {
      if (objs.length) self.addList(objs)
    })
  },
  add: function (obj) {
    var self = this
    var doc = new Search.Document(obj, this.fields)
    var returnDeferred = new Search.Deferred ()

    var words = doc.words()

    var findDeferred = new Search.Deferred(words.map(function (word) {
      return self.wordStore.find(word.id)
    }))

    findDeferred.then(function (existingWords) {

      existingWords.forEach(function (existingWord) {
        if (existingWord) {
          matchingWord = words.filter(function (word) {
            return word.id === existingWord.id
          })[0]
          
          existingWord.docs.forEach(function (doc) {
            matchingWord.docs.push(doc)
          })
        };
      })

      var saveDeferred = new Search.Deferred(words.map(function (word) {
        return self.wordStore.save(word)
      }))

      saveDeferred.then(function () {
        self.docStore.save(doc.asJSON()).then(function () {
          returnDeferred.resolve()
        })
      })
    })

    return returnDeferred
  },

  empty: function () {
    var self = this

    return new Search.Deferred ([
      self.wordStore.destroyAll(),
      self.docStore.destroyAll()
    ])
  },

  field: function (name, opts) {
    this.fields[name] = opts || {multiplier: 1}
  },

  search: function (term) {
    var self = this
    var returnDeferred = new Search.Deferred ()

    // convert the term into search words
    var words = term
      .split(' ')
      .map(function (str) {
        var word = new Search.Word(str)
        if (!word.isStopWord()) return word.toString()
      })
      .filter(function (wordString) {
        return wordString 
      })

    var wordDeferred = new Search.Deferred (words.map(function (word) { return self.wordStore.find(word) }))

    wordDeferred.then(function (words) {
      if (!words[0]) {
        returnDeferred.resolve([])
      } else {
        var wordDocs = words
          .map(function (word) { 
            return word.docs 
          })
          .sort(function (a, b) {
            if (a.score < b.score) return 1
            if (a.score > b.score) return -1
            return 0
          })

        var docIds = Search.utils.intersect.apply(Search.utils, wordDocs.map(function (docs) {
          return docs.map(function (doc) {
            return doc.documentId 
          })
        }))

        var docDeferred = new Search.Deferred (docIds.map(function (docId) { return self.docStore.find(docId) }))

        docDeferred.then(function (searchDocs) {
          returnDeferred.resolve(searchDocs.map(function (searchDoc) {
            return searchDoc.original
          }))
        })
      }
    })

    return returnDeferred

  }
}